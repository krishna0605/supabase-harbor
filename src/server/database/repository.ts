import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database/client";
import type { CipherEnvelope, VaultRecord } from "@/server/crypto/vault-crypto";
import type {
  ProjectHealthStatus,
  ProjectLifecycleStatus,
} from "@/shared/types/api";
import { HarborError } from "@/shared/errors/harbor-error";

const now = () => new Date().toISOString();

export type CachedOrganization = {
  id: string;
  slug: string;
  name: string;
  plan: string;
};

export type CachedProjectInput = {
  ref: string;
  organizationId: string;
  organizationSlug: string;
  name: string;
  region: string;
  cloudProvider: string;
  rawStatus: string;
  lifecycleStatus: ProjectLifecycleStatus;
  healthStatus: ProjectHealthStatus;
  createdAt: string;
};

export function isVaultInitialized() {
  return Boolean(
    getDatabase()
      .sqlite.prepare("SELECT 1 FROM vault_metadata WHERE id = 1")
      .get(),
  );
}

export function getVaultRecord(): VaultRecord | null {
  const row = getDatabase()
    .sqlite.prepare("SELECT * FROM vault_metadata WHERE id = 1")
    .get() as
    | {
        kdf_salt: Buffer;
        kdf_parameters: string;
        wrapped_dek: Buffer;
        wrapped_dek_nonce: Buffer;
        wrapped_dek_tag: Buffer;
      }
    | undefined;
  if (!row) return null;
  return {
    kdfSalt: row.kdf_salt,
    kdfParameters: row.kdf_parameters,
    wrappedDek: row.wrapped_dek,
    wrappedDekNonce: row.wrapped_dek_nonce,
    wrappedDekTag: row.wrapped_dek_tag,
  };
}

export function insertVault(record: VaultRecord) {
  const timestamp = now();
  getDatabase()
    .sqlite.prepare(
      `INSERT INTO vault_metadata
      (id, format_version, kdf_salt, kdf_parameters, wrapped_dek, wrapped_dek_nonce, wrapped_dek_tag, created_at, updated_at)
      VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.kdfSalt,
      record.kdfParameters,
      record.wrappedDek,
      record.wrappedDekNonce,
      record.wrappedDekTag,
      timestamp,
      timestamp,
    );
}

export function updateVault(record: VaultRecord) {
  getDatabase()
    .sqlite.prepare(
      `UPDATE vault_metadata SET kdf_salt = ?, kdf_parameters = ?, wrapped_dek = ?,
       wrapped_dek_nonce = ?, wrapped_dek_tag = ?, updated_at = ? WHERE id = 1`,
    )
    .run(
      record.kdfSalt,
      record.kdfParameters,
      record.wrappedDek,
      record.wrappedDekNonce,
      record.wrappedDekTag,
      now(),
    );
}

export function resetVaultData() {
  const sqlite = getDatabase().sqlite;
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM accounts").run();
    sqlite.prepare("DELETE FROM settings").run();
    sqlite.prepare("DELETE FROM vault_metadata").run();
    sqlite
      .prepare(
        "INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?)",
      )
      .run(
        "refresh_interval_minutes",
        "5",
        now(),
        "idle_timeout_minutes",
        "30",
        now(),
      );
  })();
}

export type AccountSecretRow = {
  id: string;
  label: string;
  enabled: boolean;
  token: CipherEnvelope;
};

export function getAccountSecret(accountId: string): AccountSecretRow {
  const row = getDatabase()
    .sqlite.prepare("SELECT * FROM accounts WHERE id = ?")
    .get(accountId) as
    | {
        id: string;
        label: string;
        enabled: number;
        token_ciphertext: Buffer;
        token_nonce: Buffer;
        token_tag: Buffer;
      }
    | undefined;
  if (!row) {
    throw new HarborError("ACCOUNT_NOT_FOUND", "Account not found.", 404);
  }
  return {
    id: row.id,
    label: row.label,
    enabled: Boolean(row.enabled),
    token: {
      ciphertext: row.token_ciphertext,
      nonce: row.token_nonce,
      tag: row.token_tag,
    },
  };
}

export function listAccountSecrets() {
  const rows = getDatabase()
    .sqlite.prepare("SELECT * FROM accounts WHERE enabled = 1 ORDER BY label")
    .all() as Array<{
    id: string;
    label: string;
    enabled: number;
    token_ciphertext: Buffer;
    token_nonce: Buffer;
    token_tag: Buffer;
  }>;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    enabled: Boolean(row.enabled),
    token: {
      ciphertext: row.token_ciphertext,
      nonce: row.token_nonce,
      tag: row.token_tag,
    },
  }));
}

export type SanitizedAccount = {
  id: string;
  label: string;
  supabaseUserId: string;
  primaryEmail: string;
  enabled: boolean;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listAccounts(): SanitizedAccount[] {
  const rows = getDatabase()
    .sqlite.prepare(
      `SELECT id, label, supabase_user_id AS supabaseUserId, primary_email AS primaryEmail,
       enabled, last_successful_sync_at AS lastSuccessfulSyncAt, last_error_code AS lastErrorCode,
       created_at AS createdAt, updated_at AS updatedAt
       FROM accounts ORDER BY label`,
    )
    .all() as Array<Omit<SanitizedAccount, "enabled"> & { enabled: number }>;
  return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) }));
}

export function insertAccountWithCache(input: {
  label: string;
  userId: string;
  primaryEmail: string;
  encryptedToken: CipherEnvelope;
  fingerprint: string;
  organizations: CachedOrganization[];
  projects: CachedProjectInput[];
}) {
  const sqlite = getDatabase().sqlite;
  const accountId = randomUUID();
  const timestamp = now();
  try {
    sqlite.transaction(() => {
      sqlite
        .prepare(
          `INSERT INTO accounts
          (id, label, supabase_user_id, primary_email, token_ciphertext, token_nonce, token_tag,
           token_fingerprint, enabled, last_successful_sync_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          accountId,
          input.label,
          input.userId,
          input.primaryEmail,
          input.encryptedToken.ciphertext,
          input.encryptedToken.nonce,
          input.encryptedToken.tag,
          input.fingerprint,
          timestamp,
          timestamp,
          timestamp,
        );
      upsertCacheInternal(
        sqlite,
        accountId,
        input.organizations,
        input.projects,
        timestamp,
      );
    })();
  } catch (error) {
    if (String(error).includes("token_fingerprint")) {
      throw new HarborError(
        "DUPLICATE_ACCOUNT",
        "This access token is already connected.",
        409,
      );
    }
    throw error;
  }
  return accountId;
}

function upsertCacheInternal(
  sqlite: ReturnType<typeof getDatabase>["sqlite"],
  accountId: string,
  orgs: CachedOrganization[],
  projectInputs: CachedProjectInput[],
  timestamp: string,
) {
  const orgStatement = sqlite.prepare(
    `INSERT INTO organizations(account_id, supabase_org_id, slug, name, plan, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, supabase_org_id) DO UPDATE SET
     slug = excluded.slug, name = excluded.name, plan = excluded.plan, last_seen_at = excluded.last_seen_at`,
  );
  for (const org of orgs) {
    orgStatement.run(
      accountId,
      org.id,
      org.slug,
      org.name,
      org.plan,
      timestamp,
    );
  }

  const projectStatement = sqlite.prepare(
    `INSERT INTO projects
     (account_id, project_ref, supabase_org_id, organization_slug, name, region, cloud_provider,
      raw_status, lifecycle_status, health_status, created_at, last_seen_at, removed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(account_id, project_ref) DO UPDATE SET
      supabase_org_id = excluded.supabase_org_id, organization_slug = excluded.organization_slug,
      name = excluded.name, region = excluded.region, cloud_provider = excluded.cloud_provider,
      raw_status = excluded.raw_status, lifecycle_status = excluded.lifecycle_status,
      health_status = excluded.health_status, last_seen_at = excluded.last_seen_at, removed_at = NULL`,
  );
  for (const project of projectInputs) {
    projectStatement.run(
      accountId,
      project.ref,
      project.organizationId,
      project.organizationSlug,
      project.name,
      project.region,
      project.cloudProvider,
      project.rawStatus,
      project.lifecycleStatus,
      project.healthStatus,
      project.createdAt,
      timestamp,
    );
  }
  const refs = projectInputs.map((project) => project.ref);
  if (refs.length > 0) {
    const placeholders = refs.map(() => "?").join(", ");
    sqlite
      .prepare(
        `UPDATE projects SET removed_at = ? WHERE account_id = ? AND project_ref NOT IN (${placeholders}) AND removed_at IS NULL`,
      )
      .run(timestamp, accountId, ...refs);
  } else {
    sqlite
      .prepare(
        "UPDATE projects SET removed_at = ? WHERE account_id = ? AND removed_at IS NULL",
      )
      .run(timestamp, accountId);
  }
}

export function upsertAccountCache(
  accountId: string,
  orgs: CachedOrganization[],
  projectInputs: CachedProjectInput[],
) {
  const sqlite = getDatabase().sqlite;
  const timestamp = now();
  sqlite.transaction(() => {
    upsertCacheInternal(sqlite, accountId, orgs, projectInputs, timestamp);
    sqlite
      .prepare(
        "UPDATE accounts SET last_successful_sync_at = ?, last_error_code = NULL, updated_at = ? WHERE id = ?",
      )
      .run(timestamp, timestamp, accountId);
  })();
}

export function setAccountError(accountId: string, errorCode: string) {
  getDatabase()
    .sqlite.prepare(
      "UPDATE accounts SET last_error_code = ?, updated_at = ? WHERE id = ?",
    )
    .run(errorCode, now(), accountId);
}

export function updateAccount(
  accountId: string,
  patch: {
    label?: string;
    enabled?: boolean;
    token?: CipherEnvelope;
    fingerprint?: string;
  },
) {
  const current = getAccountSecret(accountId);
  getDatabase()
    .sqlite.prepare(
      `UPDATE accounts SET label = ?, enabled = ?, token_ciphertext = ?, token_nonce = ?,
       token_tag = ?, token_fingerprint = COALESCE(?, token_fingerprint), updated_at = ? WHERE id = ?`,
    )
    .run(
      patch.label ?? current.label,
      (patch.enabled ?? current.enabled) ? 1 : 0,
      patch.token?.ciphertext ?? current.token.ciphertext,
      patch.token?.nonce ?? current.token.nonce,
      patch.token?.tag ?? current.token.tag,
      patch.fingerprint ?? null,
      now(),
      accountId,
    );
}

export function deleteAccount(accountId: string) {
  getDatabase()
    .sqlite.prepare("DELETE FROM accounts WHERE id = ?")
    .run(accountId);
}

export function listProjects() {
  return getDatabase()
    .sqlite.prepare(
      `SELECT p.account_id AS accountId, p.project_ref AS projectRef, p.name,
       p.supabase_org_id AS organizationId, COALESCE(o.name, p.organization_slug) AS organizationName,
       COALESCE(o.plan, 'unknown') AS organizationPlan, p.region, p.cloud_provider AS cloudProvider,
       p.raw_status AS rawStatus, p.lifecycle_status AS lifecycleStatus, p.health_status AS healthStatus,
       p.last_seen_at AS lastSeenAt, p.removed_at AS removedAt,
       a.label AS accountLabel, a.primary_email AS accountEmail,
       a.last_successful_sync_at AS accountLastSuccessfulSyncAt, a.last_error_code AS accountLastErrorCode
       FROM projects p
       JOIN accounts a ON a.id = p.account_id
       LEFT JOIN organizations o ON o.account_id = p.account_id AND o.supabase_org_id = p.supabase_org_id
       WHERE a.enabled = 1 AND p.removed_at IS NULL
       ORDER BY p.name`,
    )
    .all();
}

export function getProject(accountId: string, projectRef: string) {
  const project = getDatabase()
    .sqlite.prepare(
      "SELECT * FROM projects WHERE account_id = ? AND project_ref = ? AND removed_at IS NULL",
    )
    .get(accountId, projectRef);
  if (!project) {
    throw new HarborError("PROJECT_NOT_FOUND", "Project not found.", 404);
  }
  return project as Record<string, unknown>;
}

export function updateProjectStatus(
  accountId: string,
  projectRef: string,
  rawStatus: string,
  lifecycleStatus: ProjectLifecycleStatus,
  healthStatus: ProjectHealthStatus,
) {
  getDatabase()
    .sqlite.prepare(
      `UPDATE projects SET raw_status = ?, lifecycle_status = ?, health_status = ?,
       last_seen_at = ?, removed_at = NULL WHERE account_id = ? AND project_ref = ?`,
    )
    .run(
      rawStatus,
      lifecycleStatus,
      healthStatus,
      now(),
      accountId,
      projectRef,
    );
}

export function replaceServiceHealth(
  accountId: string,
  projectRef: string,
  services: Array<{
    name: string;
    healthy: boolean;
    status: string;
    version?: string;
    error?: string;
  }>,
) {
  const sqlite = getDatabase().sqlite;
  const timestamp = now();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        "DELETE FROM service_health WHERE account_id = ? AND project_ref = ?",
      )
      .run(accountId, projectRef);
    const statement = sqlite.prepare(
      `INSERT INTO service_health
       (account_id, project_ref, service_name, healthy, raw_status, version, error_summary, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const service of services) {
      statement.run(
        accountId,
        projectRef,
        service.name,
        service.healthy ? 1 : 0,
        service.status,
        service.version ?? null,
        service.error ?? null,
        timestamp,
      );
    }
  })();
  return listServiceHealth(accountId, projectRef);
}

export function listServiceHealth(accountId: string, projectRef: string) {
  return getDatabase()
    .sqlite.prepare(
      `SELECT service_name AS name, healthy, raw_status AS status, version,
       error_summary AS error, checked_at AS checkedAt
       FROM service_health WHERE account_id = ? AND project_ref = ? ORDER BY service_name`,
    )
    .all(accountId, projectRef)
    .map((row) => {
      const value = row as Record<string, unknown>;
      return { ...value, healthy: Boolean(value.healthy) };
    });
}

export function startSyncRun(accountId: string, trigger: string) {
  const id = randomUUID();
  getDatabase()
    .sqlite.prepare(
      "INSERT INTO sync_runs(id, account_id, trigger, status, started_at) VALUES (?, ?, ?, 'running', ?)",
    )
    .run(id, accountId, trigger, now());
  return id;
}

export function completeSyncRun(
  id: string,
  status: "completed" | "failed",
  projectCount: number,
  errorCode?: string,
) {
  getDatabase()
    .sqlite.prepare(
      "UPDATE sync_runs SET status = ?, project_count = ?, error_code = ?, completed_at = ? WHERE id = ?",
    )
    .run(status, projectCount, errorCode ?? null, now(), id);
}

export function createAction(accountId: string, projectRef: string) {
  const id = randomUUID();
  getDatabase()
    .sqlite.prepare(
      `INSERT INTO actions(id, account_id, project_ref, action_type, status, started_at)
       VALUES (?, ?, ?, 'restore', 'pending', ?)`,
    )
    .run(id, accountId, projectRef, now());
  return id;
}

export function updateAction(
  id: string,
  status: string,
  upstreamStatus?: string,
  errorCode?: string,
  completed = false,
) {
  getDatabase()
    .sqlite.prepare(
      `UPDATE actions SET status = ?, upstream_status = ?, error_code = ?,
       completed_at = CASE WHEN ? THEN ? ELSE completed_at END WHERE id = ?`,
    )
    .run(
      status,
      upstreamStatus ?? null,
      errorCode ?? null,
      completed ? 1 : 0,
      now(),
      id,
    );
}

export function getAction(id: string) {
  const row = getDatabase()
    .sqlite.prepare(
      `SELECT id, account_id AS accountId, project_ref AS projectRef, action_type AS actionType,
       status, upstream_status AS upstreamStatus, error_code AS errorCode, started_at AS startedAt,
       completed_at AS completedAt FROM actions WHERE id = ?`,
    )
    .get(id);
  if (!row) throw new HarborError("ACTION_NOT_FOUND", "Action not found.", 404);
  return row as {
    id: string;
    accountId: string;
    projectRef: string;
    actionType: string;
    status: string;
    upstreamStatus?: string;
    errorCode?: string;
    startedAt: string;
    completedAt?: string;
  };
}

export function listActivity() {
  const sqlite = getDatabase().sqlite;
  const actionRows = sqlite
    .prepare(
      `SELECT ac.id, ac.action_type AS type, ac.status, ac.project_ref AS projectRef,
       a.label AS accountLabel, p.name AS projectName, ac.error_code AS errorCode,
       ac.started_at AS startedAt, ac.completed_at AS completedAt
       FROM actions ac JOIN accounts a ON a.id = ac.account_id
       LEFT JOIN projects p ON p.account_id = ac.account_id AND p.project_ref = ac.project_ref`,
    )
    .all();
  const syncRows = sqlite
    .prepare(
      `SELECT sr.id, 'refresh' AS type, sr.status, NULL AS projectRef,
       a.label AS accountLabel, NULL AS projectName, sr.error_code AS errorCode,
       sr.started_at AS startedAt, sr.completed_at AS completedAt
       FROM sync_runs sr JOIN accounts a ON a.id = sr.account_id`,
    )
    .all();
  return [...actionRows, ...syncRows].sort((a, b) =>
    String((b as Record<string, unknown>).startedAt).localeCompare(
      String((a as Record<string, unknown>).startedAt),
    ),
  );
}

export function getSettings() {
  const rows = getDatabase()
    .sqlite.prepare("SELECT key, value FROM settings")
    .all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function updateSettings(values: Record<string, string>) {
  const sqlite = getDatabase().sqlite;
  const statement = sqlite.prepare(
    `INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  sqlite.transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      statement.run(key, value, now());
    }
  })();
  return getSettings();
}
