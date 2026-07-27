import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDatabase } from "@/server/database/client";
import type {
  CipherEnvelope,
  UserVaultRecord,
} from "@/server/crypto/hosted-crypto";

export type ClaimedKeepaliveJob = {
  userId: string;
  jobId: string;
  accountId: string;
  projectRef: string;
  trigger: string;
  leaseToken: string;
  attemptCount: number;
  maxAttempts: number;
};

export type KeepaliveJobPayload = {
  accountToken: CipherEnvelope;
  credential: CipherEnvelope;
  credentialType: "publishable" | "legacy_anon";
  credentialSource: "automatic" | "manual";
  credentialKeyId: string | null;
  vault: UserVaultRecord;
};

async function workerQuery<T>(query: BatchItem<"pg">) {
  const [, result] = await getDatabase().batch([
    getDatabase().execute(sql.raw("set local role harbor_worker")),
    query,
  ] as [BatchItem<"pg">, BatchItem<"pg">]);
  return result as { rows: T[] };
}

function buffer(value: string | Uint8Array) {
  if (typeof value !== "string") return Buffer.from(value);
  return Buffer.from(value.startsWith("\\x") ? value.slice(2) : value, "hex");
}

export async function enqueueDueKeepaliveJobs(limit = 100) {
  const result = await workerQuery<{ count: number }>(
    getDatabase().execute(
      sql`select harbor_internal.enqueue_due_keepalive_jobs(${limit}) as count`,
    ),
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function claimKeepaliveJobs(
  workerId: string,
  limit = 25,
  leaseSeconds = 120,
): Promise<ClaimedKeepaliveJob[]> {
  const result = await workerQuery<{
    userId: string;
    jobId: string;
    accountId: string;
    projectRef: string;
    trigger: string;
    leaseToken: string;
    attemptCount: number;
    maxAttempts: number;
  }>(
    getDatabase().execute(
      sql`select user_id as "userId", job_id as "jobId",
        account_id as "accountId", project_ref as "projectRef", trigger,
        lease_token as "leaseToken", attempt_count as "attemptCount",
        max_attempts as "maxAttempts"
      from harbor_internal.claim_keepalive_jobs(
        ${workerId}, ${limit}, ${leaseSeconds}
      )`,
    ),
  );
  return result.rows.map((row) => ({
    ...row,
    attemptCount: Number(row.attemptCount),
    maxAttempts: Number(row.maxAttempts),
  }));
}

export async function getKeepaliveJobPayload(
  job: ClaimedKeepaliveJob,
): Promise<KeepaliveJobPayload | null> {
  const result = await workerQuery<{
    accountTokenCiphertext: string | Uint8Array;
    accountTokenNonce: string | Uint8Array;
    accountTokenTag: string | Uint8Array;
    credentialCiphertext: string | Uint8Array;
    credentialNonce: string | Uint8Array;
    credentialTag: string | Uint8Array;
    credentialType: "publishable" | "legacy_anon";
    credentialSource: "automatic" | "manual";
    credentialKeyId: string | null;
    wrappedDek: string | Uint8Array;
    wrappedDekNonce: string | Uint8Array;
    wrappedDekTag: string | Uint8Array;
    rootKeyVersion: number;
  }>(
    getDatabase().execute(
      sql`select
        account_token_ciphertext as "accountTokenCiphertext",
        account_token_nonce as "accountTokenNonce",
        account_token_tag as "accountTokenTag",
        credential_ciphertext as "credentialCiphertext",
        credential_nonce as "credentialNonce",
        credential_tag as "credentialTag",
        credential_type as "credentialType",
        credential_source as "credentialSource",
        credential_key_id as "credentialKeyId",
        wrapped_dek as "wrappedDek",
        wrapped_dek_nonce as "wrappedDekNonce",
        wrapped_dek_tag as "wrappedDekTag",
        root_key_version as "rootKeyVersion"
      from harbor_internal.get_keepalive_job_payload(
        ${job.userId}, ${job.jobId}, ${job.leaseToken}
      )`,
    ),
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    accountToken: {
      ciphertext: buffer(row.accountTokenCiphertext),
      nonce: buffer(row.accountTokenNonce),
      tag: buffer(row.accountTokenTag),
    },
    credential: {
      ciphertext: buffer(row.credentialCiphertext),
      nonce: buffer(row.credentialNonce),
      tag: buffer(row.credentialTag),
    },
    credentialType: row.credentialType,
    credentialSource: row.credentialSource,
    credentialKeyId: row.credentialKeyId,
    vault: {
      wrappedDek: buffer(row.wrappedDek),
      wrappedDekNonce: buffer(row.wrappedDekNonce),
      wrappedDekTag: buffer(row.wrappedDekTag),
      rootKeyVersion: Number(row.rootKeyVersion),
    },
  };
}

export async function completeKeepaliveJob(input: {
  job: ClaimedKeepaliveJob;
  workerId: string;
  durationMs: number;
  upstreamStatus: number;
  pingedAt: string;
}) {
  const result = await workerQuery<{ completed: boolean }>(
    getDatabase().execute(
      sql`select harbor_internal.complete_keepalive_job(
        ${input.job.userId}, ${input.job.jobId}, ${input.job.leaseToken},
        ${input.workerId}, ${input.durationMs}, ${input.upstreamStatus},
        ${input.pingedAt}
      ) as completed`,
    ),
  );
  return Boolean(result.rows[0]?.completed);
}

export async function failKeepaliveJob(input: {
  job: ClaimedKeepaliveJob;
  workerId: string;
  durationMs: number;
  errorCode: string;
  upstreamStatus: number | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
}) {
  const result = await workerQuery<{ status: string }>(
    getDatabase().execute(
      sql`select harbor_internal.fail_keepalive_job(
        ${input.job.userId}, ${input.job.jobId}, ${input.job.leaseToken},
        ${input.workerId}, ${input.durationMs}, ${input.errorCode},
        ${input.upstreamStatus}, ${input.retryable},
        ${input.retryAfterSeconds}
      ) as status`,
    ),
  );
  return result.rows[0]?.status ?? "lease_lost";
}

export async function cleanupKeepaliveHistory(cutoff: string) {
  const result = await workerQuery<{ count: number }>(
    getDatabase().execute(
      sql`select harbor_internal.cleanup_keepalive_history(${cutoff}) as count`,
    ),
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function replaceKeepaliveCredential(input: {
  job: ClaimedKeepaliveJob;
  credential: CipherEnvelope;
  fingerprint: string;
  credentialType: "publishable" | "legacy_anon";
  credentialKeyId: string | null;
}) {
  const result = await workerQuery<{ changed: boolean }>(
    getDatabase().execute(
      sql`select harbor_internal.replace_keepalive_credential(
        ${input.job.userId}, ${input.job.jobId}, ${input.job.leaseToken},
        ${input.credential.ciphertext}, ${input.credential.nonce},
        ${input.credential.tag}, ${input.fingerprint},
        ${input.credentialType}, ${input.credentialKeyId}
      ) as changed`,
    ),
  );
  return Boolean(result.rows[0]?.changed);
}
