import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import {
  createVault,
  encryptToken,
  fingerprintToken,
} from "@/server/crypto/vault-crypto";
import { closeDatabase, getDatabase } from "@/server/database/client";
import {
  insertAccountWithCache,
  insertVault,
  listAccounts,
  listProjects,
} from "@/server/database/repository";
import { databasePath } from "@/server/config";

afterAll(() => closeDatabase());

describe("local persistence", () => {
  it("enables WAL and foreign keys", () => {
    const sqlite = getDatabase().sqlite;
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("stores an encrypted PAT without plaintext leakage", async () => {
    const plaintext = "sbp_plaintext_leak_sentinel_0123456789";
    const { dek, record } = await createVault("integration-password-safe");
    insertVault(record);
    insertAccountWithCache({
      label: "Integration",
      userId: "user-1",
      primaryEmail: "integration@example.test",
      encryptedToken: encryptToken(plaintext, dek),
      fingerprint: fingerprintToken(plaintext, dek),
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
    expect(listAccounts()).toHaveLength(1);
    expect(listProjects()).toHaveLength(1);
    getDatabase().sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const bytes = fs.readFileSync(databasePath);
    expect(bytes.includes(Buffer.from(plaintext))).toBe(false);
    dek.fill(0);
  });
});
