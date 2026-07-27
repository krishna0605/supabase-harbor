import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/neon-http";
import {
  destroyRootKeyring,
  parseRootKeyring,
  rewrapUserDek,
} from "../src/server/crypto/hosted-crypto";
import { userVaults } from "../src/server/database/schema";

loadEnvConfig(process.cwd());

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is required.");
  }
  const keyring = parseRootKeyring();
  if (!keyring.previous) {
    destroyRootKeyring(keyring);
    throw new Error(
      "Configure both previous-key variables before rotating user vaults.",
    );
  }

  const database = drizzle(neon(connectionString));
  const role = await database.execute<{
    role: string;
    bypassRls: boolean;
  }>(
    sql`select current_user as role, rolbypassrls as "bypassRls"
        from pg_roles where rolname = current_user`,
  );
  if (!role.rows[0]?.bypassRls) {
    destroyRootKeyring(keyring);
    throw new Error(
      "The migration credential must be an owner role with BYPASSRLS.",
    );
  }

  const rows = await database.select().from(userVaults);
  const pending = rows.filter(
    (row) => row.rootKeyVersion !== keyring.current.version,
  );
  const unsupported = pending.find(
    (row) => row.rootKeyVersion !== keyring.previous?.version,
  );
  if (unsupported) {
    destroyRootKeyring(keyring);
    throw new Error(
      "At least one user vault requires a key version that is not configured.",
    );
  }

  const updates: BatchItem<"pg">[] = [];
  const wrappedRecords: Array<ReturnType<typeof rewrapUserDek>> = [];
  try {
    for (const row of pending) {
      const wrapped = rewrapUserDek(row.userId, row, keyring);
      wrappedRecords.push(wrapped);
      updates.push(
        database
          .update(userVaults)
          .set({
            wrappedDek: wrapped.wrappedDek,
            wrappedDekNonce: wrapped.wrappedDekNonce,
            wrappedDekTag: wrapped.wrappedDekTag,
            rootKeyVersion: wrapped.rootKeyVersion,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(userVaults.userId, row.userId),
              eq(userVaults.rootKeyVersion, row.rootKeyVersion),
            ),
          ),
      );
    }
    if (updates.length) {
      await database.batch(
        updates as [BatchItem<"pg">, ...BatchItem<"pg">[]],
      );
    }
    console.log(`Rewrapped ${updates.length} Harbor user vault(s).`);
  } finally {
    destroyRootKeyring(keyring);
    for (const record of wrappedRecords) {
      record.wrappedDek.fill(0);
      record.wrappedDekNonce.fill(0);
      record.wrappedDekTag.fill(0);
    }
  }
}

void main();
