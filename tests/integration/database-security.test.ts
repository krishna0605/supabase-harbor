import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createUserVault,
  decryptHostedToken,
  encryptHostedToken,
  encryptKeepaliveCredential,
  fingerprintKeepaliveCredential,
  fingerprintHostedToken,
  type RootKeyring,
} from "@/server/crypto/hosted-crypto";
import { getDatabase } from "@/server/database/client";
import {
  claimKeepaliveJobs,
  cleanupRateLimits,
  enqueueDueKeepaliveJobs,
  failKeepaliveJob,
  finishWorkerSweep,
  startWorkerSweep,
} from "@/server/keepalive/worker-repository";
import {
  deleteAccount,
  ensureDefaultSettings,
  getAccountSecret,
  getKeepaliveEnrollment,
  getKeepaliveWorkerStatus,
  getSettings,
  insertAccountWithCache,
  insertUserVault,
  listAccounts,
  listKeepaliveEnrollments,
  listKeepaliveJobs,
  listProjects,
  resetTestDatabase,
  queueKeepaliveJob,
  setKeepaliveEnabled,
  updateSettings,
  upsertKeepaliveEnrollment,
  upsertAccountCache,
} from "@/server/database/repository";
import { enforceRateLimit } from "@/server/security/rate-limit";
import type { TenantContext } from "@/shared/types/auth";

const plaintext = "sbp_plaintext_leak_sentinel_0123456789";
const context = {
  userId: "__integration_test__",
  requestId: "integration-request",
} satisfies TenantContext;
const otherContext = {
  userId: "__integration_other__",
  requestId: "integration-other-request",
} satisfies TenantContext;

function testKeyring(): RootKeyring {
  return { current: { version: 1, key: randomBytes(32) } };
}

async function seedAccount(tenant = context) {
  const keys = testKeyring();
  const { dek, record } = createUserVault(tenant.userId, keys);
  await insertUserVault(tenant, record);
  await ensureDefaultSettings(tenant);
  const accountId = randomUUID();
  const encryptedToken = encryptHostedToken(
    plaintext,
    tenant.userId,
    accountId,
    dek,
  );
  const fingerprint = fingerprintHostedToken(plaintext, dek);
  await insertAccountWithCache({
    context: tenant,
    accountId,
    label: "Integration",
    userId: "supabase-user-1",
    primaryEmail: "integration@example.test",
    encryptedToken,
    fingerprint,
    organizations: [
      {
        id: "org-1",
        slug: "org-one",
        name: "Organization One",
        plan: "free",
      },
    ],
    projects: [
      {
        ref: "project-ref",
        organizationId: "org-1",
        organizationSlug: "org-one",
        name: "Test Project",
        region: "us-east-1",
        cloudProvider: "AWS",
        rawStatus: "ACTIVE_HEALTHY",
        lifecycleStatus: "active",
        healthStatus: "healthy",
        createdAt: new Date().toISOString(),
      },
    ],
  });
  keys.current.key.fill(0);
  return { accountId, dek, encryptedToken, fingerprint };
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("tenant-isolated Neon persistence", () => {
  it("uses the isolated PostgreSQL test database", async () => {
    const result = await getDatabase().execute<{
      database: string;
      version: string;
    }>(
      sql`select current_database() as database, current_setting('server_version') as version`,
    );
    expect(result.rows[0]?.database).toBe("harbor_test");
    expect(
      Number(result.rows[0]?.version.split(".")[0]),
    ).toBeGreaterThanOrEqual(18);
  });

  it("round-trips encrypted bytea without plaintext leakage", async () => {
    const { accountId, dek } = await seedAccount();
    const secret = await getAccountSecret(context, accountId);
    expect(
      decryptHostedToken(secret.token, context.userId, accountId, dek),
    ).toBe(plaintext);

    const result = await getDatabase().execute<{ leaked: boolean }>(
      sql`select encode(token_ciphertext, 'escape') like ${`%${plaintext}%`} as leaked
          from accounts where user_id = ${context.userId} and id = ${accountId}`,
    );
    expect(result.rows[0]?.leaked).toBe(false);
    expect(await listAccounts(context)).toHaveLength(1);
    expect(await listProjects(context)).toHaveLength(1);
    dek.fill(0);
  });

  it("keeps account onboarding atomic on duplicate tenant fingerprints", async () => {
    const seeded = await seedAccount();
    await expect(
      insertAccountWithCache({
        context,
        accountId: randomUUID(),
        label: "Duplicate",
        userId: "supabase-user-2",
        primaryEmail: "duplicate@example.test",
        encryptedToken: seeded.encryptedToken,
        fingerprint: seeded.fingerprint,
        organizations: [],
        projects: [],
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_ACCOUNT",
      status: 409,
    });
    expect(await listAccounts(context)).toHaveLength(1);
    seeded.dek.fill(0);
  });

  it("does not expose one tenant through another tenant context", async () => {
    const seeded = await seedAccount();
    await expect(listAccounts(otherContext)).resolves.toHaveLength(0);
    await expect(
      getAccountSecret(otherContext, seeded.accountId),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND", status: 404 });
    seeded.dek.fill(0);
  });

  it("marks missing projects removed only after a successful cache update", async () => {
    const seeded = await seedAccount();
    expect(await listProjects(context)).toHaveLength(1);
    await upsertAccountCache(context, seeded.accountId, [], []);
    expect(await listProjects(context)).toHaveLength(0);
    seeded.dek.fill(0);
  });

  it("cascades Harbor-owned cache rows when an account is removed", async () => {
    const seeded = await seedAccount();
    await deleteAccount(context, seeded.accountId);
    expect(await listProjects(context)).toHaveLength(0);
    seeded.dek.fill(0);
  });

  it("isolates encrypted keepalive enrollment and deduplicates manual jobs", async () => {
    const seeded = await seedAccount();
    const credential = encryptKeepaliveCredential(
      "sb_publishable_integration_fixture",
      context.userId,
      seeded.accountId,
      "project-ref",
      seeded.dek,
    );
    await upsertKeepaliveEnrollment({
      context,
      accountId: seeded.accountId,
      projectRef: "project-ref",
      credential,
      credentialFingerprint: fingerprintKeepaliveCredential(
        "sb_publishable_integration_fixture",
        context.userId,
        seeded.accountId,
        "project-ref",
        seeded.dek,
      ),
      credentialType: "publishable",
      credentialSource: "manual",
      verifiedAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const publicEnrollments = await listKeepaliveEnrollments(context);
    expect(publicEnrollments).toHaveLength(1);
    expect(publicEnrollments[0]).not.toHaveProperty("credentialCiphertext");
    expect(publicEnrollments[0]).not.toHaveProperty("credentialNonce");
    expect(publicEnrollments[0]).not.toHaveProperty("credentialTag");
    expect(publicEnrollments[0]).not.toHaveProperty("credentialFingerprint");
    expect(publicEnrollments[0]).not.toHaveProperty("credentialKeyId");
    await expect(listKeepaliveEnrollments(otherContext)).resolves.toHaveLength(
      0,
    );
    await expect(
      getKeepaliveEnrollment(otherContext, seeded.accountId, "project-ref"),
    ).resolves.toBeNull();

    const first = await queueKeepaliveJob(
      context,
      seeded.accountId,
      "project-ref",
    );
    const second = await queueKeepaliveJob(
      context,
      seeded.accountId,
      "project-ref",
    );
    expect(second).toBe(first);
    await expect(listKeepaliveJobs(context)).resolves.toHaveLength(1);
    credential.ciphertext.fill(0);
    credential.nonce.fill(0);
    credential.tag.fill(0);
    seeded.dek.fill(0);
  });

  it("cancels pending work when an enrollment is disabled", async () => {
    const seeded = await seedAccount();
    const credential = encryptKeepaliveCredential(
      "sb_publishable_disable_fixture",
      context.userId,
      seeded.accountId,
      "project-ref",
      seeded.dek,
    );
    await upsertKeepaliveEnrollment({
      context,
      accountId: seeded.accountId,
      projectRef: "project-ref",
      credential,
      credentialFingerprint: fingerprintKeepaliveCredential(
        "sb_publishable_disable_fixture",
        context.userId,
        seeded.accountId,
        "project-ref",
        seeded.dek,
      ),
      credentialType: "publishable",
      credentialSource: "manual",
      verifiedAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await queueKeepaliveJob(context, seeded.accountId, "project-ref");
    await setKeepaliveEnabled(context, seeded.accountId, "project-ref", false);

    expect((await listKeepaliveJobs(context))[0]?.status).toBe("cancelled");
    credential.ciphertext.fill(0);
    credential.nonce.fill(0);
    credential.tag.fill(0);
    seeded.dek.fill(0);
  });

  it("claims durable jobs once and records retry state through the worker role", async () => {
    const seeded = await seedAccount();
    const credential = encryptKeepaliveCredential(
      "sb_publishable_worker_fixture",
      context.userId,
      seeded.accountId,
      "project-ref",
      seeded.dek,
    );
    await upsertKeepaliveEnrollment({
      context,
      accountId: seeded.accountId,
      projectRef: "project-ref",
      credential,
      credentialFingerprint: fingerprintKeepaliveCredential(
        "sb_publishable_worker_fixture",
        context.userId,
        seeded.accountId,
        "project-ref",
        seeded.dek,
      ),
      credentialType: "publishable",
      credentialSource: "manual",
      verifiedAt: new Date(Date.now() - 1000).toISOString(),
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(enqueueDueKeepaliveJobs()).resolves.toBe(1);
    const claimed = await claimKeepaliveJobs("integration-worker", 5, 120);
    expect(claimed).toHaveLength(1);
    await expect(
      claimKeepaliveJobs("competing-worker", 5, 120),
    ).resolves.toHaveLength(0);
    await expect(
      failKeepaliveJob({
        job: claimed[0],
        workerId: "integration-worker",
        durationMs: 10,
        errorCode: "KEEPALIVE_TIMEOUT",
        upstreamStatus: null,
        retryable: true,
        retryAfterSeconds: 7_200,
      }),
    ).resolves.toBe("retry_wait");
    expect((await listKeepaliveJobs(context))[0]?.status).toBe("retry_wait");
    const retry = await getDatabase().execute<{ delayed: boolean }>(
      sql`select available_at >= now() + interval '119 minutes' as delayed
        from keepalive_jobs
        where user_id = ${context.userId} and id = ${claimed[0].jobId}`,
    );
    expect(retry.rows[0]?.delayed).toBe(true);
    credential.ciphertext.fill(0);
    credential.nonce.fill(0);
    credential.tag.fill(0);
    seeded.dek.fill(0);
  });

  it("forces RLS and keeps worker functions private", async () => {
    const result = await getDatabase().execute<{
      tableName: string;
      rowSecurity: boolean;
      forceRowSecurity: boolean;
    }>(
      sql`select relname as "tableName",
          relrowsecurity as "rowSecurity",
          relforcerowsecurity as "forceRowSecurity"
        from pg_class
        where relname in (
          'keepalive_enrollments', 'keepalive_jobs', 'keepalive_attempts'
        )
        order by relname`,
    );
    expect(result.rows).toHaveLength(3);
    expect(
      result.rows.every((row) => row.rowSecurity && row.forceRowSecurity),
    ).toBe(true);

    const privileges = await getDatabase().execute<{ exposed: boolean }>(
      sql`select has_function_privilege(
        'public',
        'harbor_internal.claim_keepalive_jobs(text,integer,integer)',
        'execute'
      ) as exposed`,
    );
    expect(privileges.rows[0]?.exposed).toBe(false);
  });

  it("atomically enforces rate limits without storing raw actors", async () => {
    process.env.HARBOR_RATE_LIMIT_KEY = randomBytes(32).toString("base64");
    const scope = `integration-${randomUUID().slice(0, 8)}`;
    const actor = `raw-actor-${randomUUID()}`;
    const policy = { scope, limit: 2, windowSeconds: 60 };

    await expect(enforceRateLimit(policy, actor)).resolves.toMatchObject({
      remaining: 1,
    });
    await expect(enforceRateLimit(policy, actor)).resolves.toMatchObject({
      remaining: 0,
    });
    await expect(enforceRateLimit(policy, actor)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
    });

    const stored = await getDatabase().execute<{
      actorDigest: string;
      leaksActor: boolean;
    }>(
      sql`select actor_digest as "actorDigest",
        actor_digest like ${`%${actor}%`} as "leaksActor"
      from harbor_security.rate_limit_buckets
      where scope = ${scope}`,
    );
    expect(stored.rows[0]?.actorDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0]?.leaksActor).toBe(false);
  });

  it("records sanitized worker sweep health through restricted functions", async () => {
    const sweepId = await startWorkerSweep("integration-worker", "test");
    await expect(
      finishWorkerSweep({
        sweepId,
        workerId: "integration-worker",
        status: "succeeded",
        result: {
          enqueued: 2,
          claimed: 1,
          succeeded: 1,
          retried: 0,
          failed: 0,
          deleted: 3,
        },
        errorCode: null,
      }),
    ).resolves.toBe(true);

    await expect(getKeepaliveWorkerStatus(context)).resolves.toMatchObject({
      status: "healthy",
      lastResult: "succeeded",
    });
    await expect(
      cleanupRateLimits(new Date().toISOString()),
    ).resolves.toBeGreaterThanOrEqual(0);
  });

  it("keeps Phase 5 security tables and roles private", async () => {
    const result = await getDatabase().execute<{
      runtimeCanReadRates: boolean;
      workerCanReadSweeps: boolean;
      publicCanConsume: boolean;
      runtimeBypassRls: boolean;
      workerBypassRls: boolean;
    }>(
      sql`select
        has_table_privilege(
          'harbor_runtime',
          'harbor_security.rate_limit_buckets',
          'select'
        ) as "runtimeCanReadRates",
        has_table_privilege(
          'harbor_worker',
          'harbor_internal.worker_sweeps',
          'select'
        ) as "workerCanReadSweeps",
        has_function_privilege(
          'public',
          'harbor_security.consume_rate_limit(text,text,integer,integer)',
          'execute'
        ) as "publicCanConsume",
        (select rolbypassrls from pg_roles where rolname = 'harbor_runtime')
          as "runtimeBypassRls",
        (select rolbypassrls from pg_roles where rolname = 'harbor_worker')
          as "workerBypassRls"`,
    );
    expect(result.rows[0]).toEqual({
      runtimeCanReadRates: false,
      workerCanReadSweeps: false,
      publicCanConsume: false,
      runtimeBypassRls: false,
      workerBypassRls: false,
    });
  });

  it("upserts settings inside one tenant", async () => {
    await ensureDefaultSettings(context);
    await updateSettings(context, { refresh_interval_minutes: "10" });
    await updateSettings(context, { refresh_interval_minutes: "15" });
    await expect(getSettings(context)).resolves.toMatchObject({
      refresh_interval_minutes: "15",
      idle_timeout_minutes: "30",
    });
    await expect(getSettings(otherContext)).resolves.toEqual({});
  });
});
