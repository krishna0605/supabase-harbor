import {
  boolean,
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
