import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createVault,
  decryptToken,
  encryptToken,
  fingerprintToken,
} from "@/server/crypto/vault-crypto";
import { getDatabase } from "@/server/database/client";
import {
  deleteAccount,
  getAccountSecret,
  getSettings,
  insertAccountWithCache,
  insertVault,
  listAccounts,
  listProjects,
  resetTestDatabase,
  updateSettings,
  upsertAccountCache,
} from "@/server/database/repository";
const plaintext = "sbp_plaintext_leak_sentinel_0123456789";

async function seedAccount() {
  const { dek, record } = await createVault("integration-password-safe");
  await insertVault(record);
  const encryptedToken = encryptToken(plaintext, dek);
  const fingerprint = fingerprintToken(plaintext, dek);
  const accountId = await insertAccountWithCache({
    label: "Integration",
    userId: "user-1",
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
  return { accountId, dek, encryptedToken, fingerprint };
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("Neon persistence", () => {
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
    const secret = await getAccountSecret(accountId);
    expect(decryptToken(secret.token, dek)).toBe(plaintext);

    const result = await getDatabase().execute<{ leaked: boolean }>(
      sql`select encode(token_ciphertext, 'escape') like ${`%${plaintext}%`} as leaked
          from accounts where id = ${accountId}`,
    );
    expect(result.rows[0]?.leaked).toBe(false);
    expect(await listAccounts()).toHaveLength(1);
    expect(await listProjects()).toHaveLength(1);
    dek.fill(0);
  });

  it("keeps account onboarding atomic on duplicate fingerprints", async () => {
    const seeded = await seedAccount();
    await expect(
      insertAccountWithCache({
        label: "Duplicate",
        userId: "user-2",
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
    expect(await listAccounts()).toHaveLength(1);
    seeded.dek.fill(0);
  });

  it("marks missing projects removed only after a successful cache update", async () => {
    const seeded = await seedAccount();
    expect(await listProjects()).toHaveLength(1);
    await upsertAccountCache(seeded.accountId, [], []);
    expect(await listProjects()).toHaveLength(0);
    seeded.dek.fill(0);
  });

  it("cascades Harbor-owned cache rows when an account is removed", async () => {
    const seeded = await seedAccount();
    await deleteAccount(seeded.accountId);
    const result = await getDatabase().execute<{ count: string }>(
      sql`select count(*)::text as count from projects`,
    );
    expect(result.rows[0]?.count).toBe("0");
    seeded.dek.fill(0);
  });

  it("upserts settings while preserving defaults", async () => {
    await updateSettings({ refresh_interval_minutes: "10" });
    await updateSettings({ refresh_interval_minutes: "15" });
    await expect(getSettings()).resolves.toMatchObject({
      refresh_interval_minutes: "15",
      idle_timeout_minutes: "30",
    });
  });
});
