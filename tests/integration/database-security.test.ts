import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createUserVault,
  decryptHostedToken,
  encryptHostedToken,
  fingerprintHostedToken,
  type RootKeyring,
} from "@/server/crypto/hosted-crypto";
import { getDatabase } from "@/server/database/client";
import {
  deleteAccount,
  ensureDefaultSettings,
  getAccountSecret,
  getSettings,
  insertAccountWithCache,
  insertUserVault,
  listAccounts,
  listProjects,
  resetTestDatabase,
  updateSettings,
  upsertAccountCache,
} from "@/server/database/repository";
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
    expect(Number(result.rows[0]?.version.split(".")[0])).toBeGreaterThanOrEqual(
      18,
    );
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
