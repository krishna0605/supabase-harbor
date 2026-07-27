import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: string | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value) {
    if (typeof value !== "string") return Buffer.from(value);
    return Buffer.from(value.startsWith("\\x") ? value.slice(2) : value, "hex");
  },
});

const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const userVaults = pgTable("user_vaults", {
  userId: text("user_id").primaryKey(),
  wrappedDek: bytea("wrapped_dek").notNull(),
  wrappedDekNonce: bytea("wrapped_dek_nonce").notNull(),
  wrappedDekTag: bytea("wrapped_dek_tag").notNull(),
  rootKeyVersion: integer("root_key_version").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    label: text("label").notNull(),
    supabaseUserId: text("supabase_user_id").notNull(),
    primaryEmail: text("primary_email").notNull(),
    tokenCiphertext: bytea("token_ciphertext").notNull(),
    tokenNonce: bytea("token_nonce").notNull(),
    tokenTag: bytea("token_tag").notNull(),
    tokenFingerprint: text("token_fingerprint").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastSuccessfulSyncAt: utcTimestamp("last_successful_sync_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
    updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    uniqueIndex("accounts_user_token_fingerprint_unique").on(
      table.userId,
      table.tokenFingerprint,
    ),
    index("accounts_user_enabled_label_idx").on(
      table.userId,
      table.enabled,
      table.label,
    ),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    supabaseOrgId: text("supabase_org_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("unknown"),
    lastSeenAt: utcTimestamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.accountId, table.supabaseOrgId],
    }),
    foreignKey({
      columns: [table.userId, table.accountId],
      foreignColumns: [accounts.userId, accounts.id],
      name: "organizations_account_fk",
    }).onDelete("cascade"),
  ],
);

export const projects = pgTable(
  "projects",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    supabaseOrgId: text("supabase_org_id").notNull(),
    organizationSlug: text("organization_slug").notNull().default(""),
    name: text("name").notNull(),
    region: text("region").notNull(),
    cloudProvider: text("cloud_provider").notNull().default("unknown"),
    rawStatus: text("raw_status").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    healthStatus: text("health_status").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
    lastSeenAt: utcTimestamp("last_seen_at").notNull().defaultNow(),
    removedAt: utcTimestamp("removed_at"),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.accountId, table.projectRef],
    }),
    foreignKey({
      columns: [table.userId, table.accountId],
      foreignColumns: [accounts.userId, accounts.id],
      name: "projects_account_fk",
    }).onDelete("cascade"),
    index("projects_user_account_removed_name_idx").on(
      table.userId,
      table.accountId,
      table.removedAt,
      table.name,
    ),
  ],
);

export const serviceHealth = pgTable(
  "service_health",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    serviceName: text("service_name").notNull(),
    healthy: boolean("healthy").notNull(),
    rawStatus: text("raw_status").notNull(),
    version: text("version"),
    errorSummary: text("error_summary"),
    checkedAt: utcTimestamp("checked_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.accountId,
        table.projectRef,
        table.serviceName,
      ],
    }),
    foreignKey({
      columns: [table.userId, table.accountId, table.projectRef],
      foreignColumns: [
        projects.userId,
        projects.accountId,
        projects.projectRef,
      ],
      name: "service_health_project_fk",
    }).onDelete("cascade"),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    projectCount: integer("project_count").notNull().default(0),
    errorCode: text("error_code"),
    startedAt: utcTimestamp("started_at").notNull().defaultNow(),
    completedAt: utcTimestamp("completed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    foreignKey({
      columns: [table.userId, table.accountId],
      foreignColumns: [accounts.userId, accounts.id],
      name: "sync_runs_account_fk",
    }).onDelete("cascade"),
    index("sync_runs_user_account_started_idx").on(
      table.userId,
      table.accountId,
      table.startedAt.desc(),
    ),
  ],
);

export const actions = pgTable(
  "actions",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    actionType: text("action_type").notNull(),
    status: text("status").notNull(),
    upstreamStatus: text("upstream_status"),
    errorCode: text("error_code"),
    startedAt: utcTimestamp("started_at").notNull().defaultNow(),
    completedAt: utcTimestamp("completed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    foreignKey({
      columns: [table.userId, table.accountId, table.projectRef],
      foreignColumns: [
        projects.userId,
        projects.accountId,
        projects.projectRef,
      ],
      name: "actions_project_fk",
    }).onDelete("cascade"),
    index("actions_user_account_started_idx").on(
      table.userId,
      table.accountId,
      table.startedAt.desc(),
    ),
  ],
);

export const settings = pgTable(
  "settings",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

export const keepaliveEnrollments = pgTable(
  "keepalive_enrollments",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    credentialCiphertext: bytea("credential_ciphertext").notNull(),
    credentialNonce: bytea("credential_nonce").notNull(),
    credentialTag: bytea("credential_tag").notNull(),
    credentialFingerprint: text("credential_fingerprint").notNull(),
    credentialType: text("credential_type").notNull(),
    credentialSource: text("credential_source").notNull(),
    credentialKeyId: text("credential_key_id"),
    nextRunAt: utcTimestamp("next_run_at").notNull(),
    lastAttemptAt: utcTimestamp("last_attempt_at"),
    lastSuccessAt: utcTimestamp("last_success_at"),
    lastErrorCode: text("last_error_code"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    needsAttention: boolean("needs_attention").notNull().default(false),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
    updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.accountId, table.projectRef],
    }),
    foreignKey({
      columns: [table.userId, table.accountId, table.projectRef],
      foreignColumns: [
        projects.userId,
        projects.accountId,
        projects.projectRef,
      ],
      name: "keepalive_enrollments_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("keepalive_enrollments_user_project_fingerprint_unique").on(
      table.userId,
      table.accountId,
      table.projectRef,
      table.credentialFingerprint,
    ),
    index("keepalive_enrollments_user_enabled_next_idx").on(
      table.userId,
      table.enabled,
      table.nextRunAt,
    ),
    check(
      "keepalive_enrollments_credential_type_check",
      sql`${table.credentialType} in ('publishable', 'legacy_anon')`,
    ),
    check(
      "keepalive_enrollments_credential_source_check",
      sql`${table.credentialSource} in ('automatic', 'manual')`,
    ),
    check(
      "keepalive_enrollments_failures_check",
      sql`${table.consecutiveFailures} >= 0`,
    ),
  ],
);

export const keepaliveJobs = pgTable(
  "keepalive_jobs",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    scheduledFor: utcTimestamp("scheduled_for").notNull(),
    availableAt: utcTimestamp("available_at").notNull(),
    workerId: text("worker_id"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: utcTimestamp("lease_expires_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    lastErrorCode: text("last_error_code"),
    lastUpstreamStatus: integer("last_upstream_status"),
    startedAt: utcTimestamp("started_at"),
    completedAt: utcTimestamp("completed_at"),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
    updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    foreignKey({
      columns: [table.userId, table.accountId, table.projectRef],
      foreignColumns: [
        keepaliveEnrollments.userId,
        keepaliveEnrollments.accountId,
        keepaliveEnrollments.projectRef,
      ],
      name: "keepalive_jobs_enrollment_fk",
    }).onDelete("cascade"),
    uniqueIndex("keepalive_jobs_user_project_slot_unique").on(
      table.userId,
      table.accountId,
      table.projectRef,
      table.trigger,
      table.scheduledFor,
    ),
    index("keepalive_jobs_due_idx").on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    index("keepalive_jobs_user_project_scheduled_idx").on(
      table.userId,
      table.accountId,
      table.projectRef,
      table.scheduledFor.desc(),
    ),
    check(
      "keepalive_jobs_trigger_check",
      sql`${table.trigger} in ('scheduled', 'manual', 'enrollment_validation')`,
    ),
    check(
      "keepalive_jobs_status_check",
      sql`${table.status} in ('pending', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "keepalive_jobs_attempts_check",
      sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts}`,
    ),
  ],
);

export const keepaliveAttempts = pgTable(
  "keepalive_attempts",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    jobId: text("job_id").notNull(),
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    upstreamStatus: integer("upstream_status"),
    workerId: text("worker_id").notNull(),
    durationMs: integer("duration_ms").notNull(),
    startedAt: utcTimestamp("started_at").notNull(),
    completedAt: utcTimestamp("completed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    foreignKey({
      columns: [table.userId, table.jobId],
      foreignColumns: [keepaliveJobs.userId, keepaliveJobs.id],
      name: "keepalive_attempts_job_fk",
    }).onDelete("cascade"),
    index("keepalive_attempts_user_job_started_idx").on(
      table.userId,
      table.jobId,
      table.startedAt.desc(),
    ),
    check(
      "keepalive_attempts_status_check",
      sql`${table.status} in ('succeeded', 'failed')`,
    ),
    check(
      "keepalive_attempts_values_check",
      sql`${table.attemptNumber} > 0 and ${table.durationMs} >= 0`,
    ),
  ],
);
