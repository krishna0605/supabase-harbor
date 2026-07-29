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
  cleanupRateLimits,
  cleanupWorkerSweeps,
  completeKeepaliveJob,
  enqueueDueKeepaliveJobs,
  failKeepaliveJob,
  finishWorkerSweep,
  getKeepaliveJobPayload,
  replaceKeepaliveCredential,
  startWorkerSweep,
  type ClaimedKeepaliveJob,
  type WorkerSweepResult,
} from "@/server/keepalive/worker-repository";
import { supabaseManagement } from "@/server/supabase/client";
import { logger } from "@/server/logging/logger";
import { HarborError } from "@/shared/errors/harbor-error";

export type SweepOptions = {
  workerId: string;
  deploymentEnvironment: string;
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

function deploymentEnvironment(value: string | undefined) {
  const normalized = (value || "local")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return /^[a-z][a-z0-9-]{0,31}$/.test(normalized) ? normalized : "unknown";
}

export function workerOptions(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): SweepOptions {
  return {
    workerId:
      environment.KEEPALIVE_WORKER_ID ||
      environment.RAILWAY_REPLICA_ID ||
      `local-${process.pid}`,
    deploymentEnvironment: deploymentEnvironment(
      environment.RAILWAY_ENVIRONMENT_NAME || environment.HARBOR_DEPLOYMENT_ENV,
    ),
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

type JobOutcome = "succeeded" | "retried" | "failed" | "lease_lost";

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

async function processJob(
  job: ClaimedKeepaliveJob,
  workerId: string,
): Promise<JobOutcome> {
  const startedAt = Date.now();
  const payload = await getKeepaliveJobPayload(job);
  if (!payload) {
    const status = await failKeepaliveJob({
      job,
      workerId,
      durationMs: Date.now() - startedAt,
      errorCode: "KEEPALIVE_LEASE_LOST",
      upstreamStatus: null,
      retryable: true,
      retryAfterSeconds: null,
    });
    return status === "retry_wait"
      ? "retried"
      : status === "failed"
        ? "failed"
        : "lease_lost";
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
      return "lease_lost";
    }
    return "succeeded";
  } catch (error) {
    const normalized = workerError(error);
    const status = await failKeepaliveJob({
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
    return status === "retry_wait"
      ? "retried"
      : status === "failed"
        ? "failed"
        : "lease_lost";
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
  const result: WorkerSweepResult = {
    enqueued: 0,
    claimed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    deleted: 0,
  };
  const sweepId = await startWorkerSweep(
    options.workerId,
    options.deploymentEnvironment,
  );
  try {
    const deadline = Date.now() + options.deadlineMs;
    result.enqueued = await enqueueDueKeepaliveJobs(
      Math.min(options.claimLimit * 4, 100),
    );
    const claimed = await claimKeepaliveJobs(
      options.workerId,
      options.claimLimit,
      120,
    );
    result.claimed = claimed.length;
    const limit = pLimit(options.concurrency);
    const outcomes = await Promise.all(
      claimed.map((job) =>
        limit(async (): Promise<JobOutcome | null> => {
          if (shouldStop() || Date.now() >= deadline) return null;
          return processJob(job, options.workerId);
        }),
      ),
    );
    result.succeeded = outcomes.filter(
      (outcome) => outcome === "succeeded",
    ).length;
    result.retried = outcomes.filter((outcome) => outcome === "retried").length;
    result.failed = outcomes.filter((outcome) => outcome === "failed").length;

    if (!shouldStop()) {
      const jobCutoff = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString();
      result.deleted = await cleanupKeepaliveHistory(jobCutoff);
      await cleanupRateLimits(new Date().toISOString());
      const sweepCutoff = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await cleanupWorkerSweeps(sweepCutoff);
    }
    await finishWorkerSweep({
      sweepId,
      workerId: options.workerId,
      status: "succeeded",
      result,
      errorCode: null,
    });
    return {
      enqueued: result.enqueued,
      claimed: result.claimed,
      deleted: result.deleted,
    };
  } catch (error) {
    const normalized = workerError(error);
    try {
      await finishWorkerSweep({
        sweepId,
        workerId: options.workerId,
        status: "failed",
        result,
        errorCode: normalized.code,
      });
    } catch {
      logger.warn(
        { errorCode: "KEEPALIVE_TELEMETRY_FAILED" },
        "Worker sweep telemetry could not be finalized",
      );
    }
    throw error;
  }
}
