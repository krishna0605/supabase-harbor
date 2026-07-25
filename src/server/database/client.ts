import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  backupsDir,
  databasePath,
  harborDataDir,
  logsDir,
} from "@/server/config";
import * as schema from "@/server/database/schema";

type DatabaseState = {
  sqlite: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;
};

const globalForDatabase = globalThis as unknown as {
  harborDatabase?: DatabaseState;
};

function ensureDirectories() {
  for (const directory of [harborDataDir, logsDir, backupsDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function backupBeforeMigration() {
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0)
    return;
  const existing = new Database(databasePath, { readonly: true });
  try {
    const hasMeta = existing
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
      )
      .get();
    const version = hasMeta
      ? (
          existing
            .prepare("SELECT MAX(version) AS version FROM schema_meta")
            .get() as { version: number | null } | undefined
        )?.version
      : null;
    if (version && version >= 1) return;
  } finally {
    existing.close();
  }
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backup = path.join(backupsDir, `pre-migration-${stamp}.db`);
  fs.copyFileSync(databasePath, backup);
  const backups = fs
    .readdirSync(backupsDir)
    .filter((name) => name.startsWith("pre-migration-") && name.endsWith(".db"))
    .sort()
    .reverse();
  for (const oldBackup of backups.slice(5)) {
    fs.rmSync(path.join(backupsDir, oldBackup));
  }
}

const initialSchema = `
CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vault_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  format_version INTEGER NOT NULL,
  kdf_salt BLOB NOT NULL,
  kdf_parameters TEXT NOT NULL,
  wrapped_dek BLOB NOT NULL,
  wrapped_dek_nonce BLOB NOT NULL,
  wrapped_dek_tag BLOB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  supabase_user_id TEXT NOT NULL,
  primary_email TEXT NOT NULL,
  token_ciphertext BLOB NOT NULL,
  token_nonce BLOB NOT NULL,
  token_tag BLOB NOT NULL,
  token_fingerprint TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_successful_sync_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  supabase_org_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (account_id, supabase_org_id)
);
CREATE TABLE IF NOT EXISTS projects (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_ref TEXT NOT NULL,
  supabase_org_id TEXT NOT NULL,
  organization_slug TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  cloud_provider TEXT NOT NULL DEFAULT 'unknown',
  raw_status TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  health_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (account_id, project_ref)
);
CREATE TABLE IF NOT EXISTS service_health (
  account_id TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  service_name TEXT NOT NULL,
  healthy INTEGER NOT NULL,
  raw_status TEXT NOT NULL,
  version TEXT,
  error_summary TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (account_id, project_ref, service_name),
  FOREIGN KEY (account_id, project_ref) REFERENCES projects(account_id, project_ref) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  project_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_ref TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  upstream_status TEXT,
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES
  ('refresh_interval_minutes', '5', datetime('now')),
  ('idle_timeout_minutes', '30', datetime('now'));
INSERT OR IGNORE INTO schema_meta(version, applied_at) VALUES (1, datetime('now'));
`;

function createDatabase(): DatabaseState {
  ensureDirectories();
  backupBeforeMigration();
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(initialSchema);
  return { sqlite, orm: drizzle(sqlite, { schema }) };
}

export function getDatabase() {
  if (!globalForDatabase.harborDatabase) {
    globalForDatabase.harborDatabase = createDatabase();
  }
  return globalForDatabase.harborDatabase;
}

export function closeDatabase() {
  globalForDatabase.harborDatabase?.sqlite.close();
  globalForDatabase.harborDatabase = undefined;
}
