import {
  blob,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const vaultMetadata = sqliteTable("vault_metadata", {
  id: integer("id").primaryKey(),
  formatVersion: integer("format_version").notNull(),
  kdfSalt: blob("kdf_salt", { mode: "buffer" }).notNull(),
  kdfParameters: text("kdf_parameters").notNull(),
  wrappedDek: blob("wrapped_dek", { mode: "buffer" }).notNull(),
  wrappedDekNonce: blob("wrapped_dek_nonce", { mode: "buffer" }).notNull(),
  wrappedDekTag: blob("wrapped_dek_tag", { mode: "buffer" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  supabaseUserId: text("supabase_user_id").notNull(),
  primaryEmail: text("primary_email").notNull(),
  tokenCiphertext: blob("token_ciphertext", { mode: "buffer" }).notNull(),
  tokenNonce: blob("token_nonce", { mode: "buffer" }).notNull(),
  tokenTag: blob("token_tag", { mode: "buffer" }).notNull(),
  tokenFingerprint: text("token_fingerprint").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSuccessfulSyncAt: text("last_successful_sync_at"),
  lastErrorCode: text("last_error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const organizations = sqliteTable(
  "organizations",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    supabaseOrgId: text("supabase_org_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("unknown"),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.supabaseOrgId] })],
);

export const projects = sqliteTable(
  "projects",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    projectRef: text("project_ref").notNull(),
    supabaseOrgId: text("supabase_org_id").notNull(),
    organizationSlug: text("organization_slug").notNull().default(""),
    name: text("name").notNull(),
    region: text("region").notNull(),
    cloudProvider: text("cloud_provider").notNull().default("unknown"),
    rawStatus: text("raw_status").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    healthStatus: text("health_status").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    removedAt: text("removed_at"),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.projectRef] })],
);

export const serviceHealth = sqliteTable(
  "service_health",
  {
    accountId: text("account_id").notNull(),
    projectRef: text("project_ref").notNull(),
    serviceName: text("service_name").notNull(),
    healthy: integer("healthy", { mode: "boolean" }).notNull(),
    rawStatus: text("raw_status").notNull(),
    version: text("version"),
    errorSummary: text("error_summary"),
    checkedAt: text("checked_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.accountId, table.projectRef, table.serviceName],
    }),
  ],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  projectCount: integer("project_count").notNull().default(0),
  errorCode: text("error_code"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  projectRef: text("project_ref").notNull(),
  actionType: text("action_type").notNull(),
  status: text("status").notNull(),
  upstreamStatus: text("upstream_status"),
  errorCode: text("error_code"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
