import pLimit from "p-limit";
import {
  decryptHostedToken,
  decryptKeepaliveCredential,
  destroyRootKeyring,
  encryptKeepaliveCredential,
  fingerprintKeepaliveCredential,
  parseRootKeyring,
  unwrapUserDek,
} from "@/server/crypto/hosted-crypto";
import { selectKeepaliveCredential } from "@/features/keepalive/credential-validation";
import { pingProject } from "@/server/keepalive/heartbeat-client";
import {
  claimKeepaliveJobs,
  cleanupKeepaliveHistory,
  completeKeepaliveJob,
  enqueueDueKeepaliveJobs,
  failKeepaliveJob,
  getKeepaliveJobPayload,
  replaceKeepaliveCredential,
  type ClaimedKeepaliveJob,
} from "@/server/keepalive/worker-repository";
import { supabaseManagement } from "@/server/supabase/client";
import { logger } from "@/server/logging/logger";
import { HarborError } from "@/shared/errors/harbor-error";

export type SweepOptions = {
  workerId: string;
  claimLimit: number;
  concurrency: number;
  deadlineMs: number;
};

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Worker setting must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}

export function workerOptions(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): SweepOptions {
  return {
    workerId:
      environment.KEEPALIVE_WORKER_ID ||
      environment.RAILWAY_REPLICA_ID ||
      `local-${process.pid}`,
    claimLimit: boundedInteger(environment.KEEPALIVE_CLAIM_LIMIT, 25, 1, 100),
    concurrency: boundedInteger(
      environment.KEEPALIVE_MAX_CONCURRENCY,
      5,
      1,
      20,
    ),
    deadlineMs: boundedInteger(
      environment.KEEPALIVE_SWEEP_TIMEOUT_MS,
      240_000,
      30_000,
      240_000,
    ),
  };
}

function workerError(error: unknown) {
  if (error instanceof HarborError) {
    return {
      code: error.code,
      retryable: error.retryable,
      upstreamStatus:
        error.code === "KEEPALIVE_RATE_LIMITED"
          ? 429
          : error.code === "KEEPALIVE_KEY_REJECTED"
            ? 401
            : error.code === "KEEPALIVE_RPC_NOT_INSTALLED"
              ? 404
              : null,
      retryAfterSeconds:
        error.retryAfterMs === undefined
          ? null
          : Math.ceil(error.retryAfterMs / 1000),
    };
  }
  return {
    code: "KEEPALIVE_WORKER_ERROR",
    retryable: true,
    upstreamStatus: null,
    retryAfterSeconds: null,
  };
}

async function refreshAutomaticCredential(
  job: ClaimedKeepaliveJob,
  token: string,
  dek: Buffer,
) {
  const selected = selectKeepaliveCredential(
    await supabaseManagement.projectApiKeys(
      token,
      job.projectRef,
      job.accountId,
    ),
  );
  const encrypted = encryptKeepaliveCredential(
    selected.value,
    job.userId,
    job.accountId,
    job.projectRef,
    dek,
  );
  try {
    const changed = await replaceKeepaliveCredential({
      job,
      credential: encrypted,
      fingerprint: fingerprintKeepaliveCredential(
        selected.value,
        job.userId,
        job.accountId,
        job.projectRef,
        dek,
      ),
      credentialType: selected.type,
      credentialKeyId: selected.keyId,
    });
    return changed ? selected.value : null;
  } finally {
    encrypted.ciphertext.fill(0);
    encrypted.nonce.fill(0);
    encrypted.tag.fill(0);
  }
}

async function processJob(job: ClaimedKeepaliveJob, workerId: string) {
  const startedAt = Date.now();
  const payload = await getKeepaliveJobPayload(job);
  if (!payload) {
    await failKeepaliveJob({
      job,
      workerId,
      durationMs: Date.now() - startedAt,
      errorCode: "KEEPALIVE_LEASE_LOST",
      upstreamStatus: null,
      retryable: true,
      retryAfterSeconds: null,
    });
    return;
  }

  const keyring = parseRootKeyring();
  const dek = unwrapUserDek(job.userId, payload.vault, keyring);
  let accountToken = "";
  let credential = "";
  try {
    accountToken = decryptHostedToken(
      payload.accountToken,
      job.userId,
      job.accountId,
      dek,
    );
    credential = decryptKeepaliveCredential(
      payload.credential,
      job.userId,
      job.accountId,
      job.projectRef,
      dek,
    );
    let heartbeat;
    try {
      heartbeat = await pingProject(job.projectRef, credential);
    } catch (error) {
      if (
        error instanceof HarborError &&
        error.code === "KEEPALIVE_KEY_REJECTED" &&
        payload.credentialSource === "automatic"
      ) {
        const replacement = await refreshAutomaticCredential(
          job,
          accountToken,
          dek,
        );
        if (replacement) {
          credential = replacement;
          heartbeat = await pingProject(job.projectRef, credential);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
    const completed = await completeKeepaliveJob({
      job,
      workerId,
      durationMs: Date.now() - startedAt,
      upstreamStatus: heartbeat.upstreamStatus,
      pingedAt: heartbeat.pingedAt,
    });
    if (!completed) {
      logger.warn(
        { jobId: job.jobId, projectRef: job.projectRef },
        "Keepalive job lost its lease before completion",
      );
    }
  } catch (error) {
    const normalized = workerError(error);
    await failKeepaliveJob({
      job,
      workerId,
      durationMs: Math.min(Date.now() - startedAt, 240_000),
      errorCode: normalized.code,
      upstreamStatus: normalized.upstreamStatus,
      retryable: normalized.retryable,
      retryAfterSeconds: normalized.retryAfterSeconds,
    });
    logger.warn(
      {
        jobId: job.jobId,
        projectRef: job.projectRef,
        errorCode: normalized.code,
        retryable: normalized.retryable,
      },
      "Keepalive job failed",
    );
  } finally {
    accountToken = "";
    credential = "";
    dek.fill(0);
    destroyRootKeyring(keyring);
    for (const value of [
      payload.accountToken.ciphertext,
      payload.accountToken.nonce,
      payload.accountToken.tag,
      payload.credential.ciphertext,
      payload.credential.nonce,
      payload.credential.tag,
      payload.vault.wrappedDek,
      payload.vault.wrappedDekNonce,
      payload.vault.wrappedDekTag,
    ]) {
      value.fill(0);
    }
  }
}

export async function runKeepaliveSweep(
  options = workerOptions(),
  shouldStop: () => boolean = () => false,
) {
  if (shouldStop()) {
    return { enqueued: 0, claimed: 0, deleted: 0 };
  }
  const deadline = Date.now() + options.deadlineMs;
  const enqueued = await enqueueDueKeepaliveJobs(
    Math.min(options.claimLimit * 4, 100),
  );
  const claimed = await claimKeepaliveJobs(
    options.workerId,
    options.claimLimit,
    120,
  );
  const limit = pLimit(options.concurrency);
  await Promise.all(
    claimed.map((job) =>
      limit(async () => {
        if (shouldStop() || Date.now() >= deadline) return;
        await processJob(job, options.workerId);
      }),
    ),
  );
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const deleted = shouldStop() ? 0 : await cleanupKeepaliveHistory(cutoff);
  return { enqueued, claimed: claimed.length, deleted };
}
