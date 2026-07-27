import { randomUUID } from "node:crypto";
import type { BatchItem } from "drizzle-orm/batch";
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import type { CipherEnvelope, VaultRecord } from "@/server/crypto/vault-crypto";
import { getDatabase } from "@/server/database/client";
import {
  accounts,
  actions,
  organizations,
  projects,
  serviceHealth,
  settings,
  syncRuns,
  vaultMetadata,
} from "@/server/database/schema";
import { HarborError } from "@/shared/errors/harbor-error";
import type {
  ProjectHealthStatus,
  ProjectLifecycleStatus,
} from "@/shared/types/api";

const now = () => new Date().toISOString();

async function runBatch(queries: BatchItem<"pg">[]) {
  if (queries.length === 0) return [];
  return getDatabase().batch(
    queries as [BatchItem<"pg">, ...BatchItem<"pg">[]],
  );
}

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

export async function isVaultInitialized() {
  const rows = await getDatabase()
    .select({ id: vaultMetadata.id })
    .from(vaultMetadata)
    .where(eq(vaultMetadata.id, 1))
    .limit(1);
  return rows.length > 0;
}

export async function getVaultRecord(): Promise<VaultRecord | null> {
  const [row] = await getDatabase()
    .select()
    .from(vaultMetadata)
    .where(eq(vaultMetadata.id, 1))
    .limit(1);
  if (!row) return null;
  return {
    kdfSalt: row.kdfSalt,
    kdfParameters: row.kdfParameters,
    wrappedDek: row.wrappedDek,
    wrappedDekNonce: row.wrappedDekNonce,
    wrappedDekTag: row.wrappedDekTag,
  };
}

export async function insertVault(record: VaultRecord) {
  await getDatabase().insert(vaultMetadata).values({
    id: 1,
    formatVersion: 1,
    kdfSalt: record.kdfSalt,
    kdfParameters: record.kdfParameters,
    wrappedDek: record.wrappedDek,
    wrappedDekNonce: record.wrappedDekNonce,
    wrappedDekTag: record.wrappedDekTag,
  });
}

export async function updateVault(record: VaultRecord) {
  await getDatabase()
    .update(vaultMetadata)
    .set({
      kdfSalt: record.kdfSalt,
      kdfParameters: record.kdfParameters,
      wrappedDek: record.wrappedDek,
      wrappedDekNonce: record.wrappedDekNonce,
      wrappedDekTag: record.wrappedDekTag,
      updatedAt: now(),
    })
    .where(eq(vaultMetadata.id, 1));
}

export async function resetVaultData() {
  const timestamp = now();
  await runBatch([
    getDatabase().delete(accounts),
    getDatabase().delete(settings),
    getDatabase().delete(vaultMetadata),
    getDatabase()
      .insert(settings)
      .values([
        {
          key: "refresh_interval_minutes",
          value: "5",
          updatedAt: timestamp,
        },
        {
          key: "idle_timeout_minutes",
          value: "30",
          updatedAt: timestamp,
        },
      ]),
  ]);
}

export type AccountSecretRow = {
  id: string;
  label: string;
  enabled: boolean;
  token: CipherEnvelope;
};

export async function getAccountSecret(
  accountId: string,
): Promise<AccountSecretRow> {
  const [row] = await getDatabase()
    .select({
      id: accounts.id,
      label: accounts.label,
      enabled: accounts.enabled,
      tokenCiphertext: accounts.tokenCiphertext,
      tokenNonce: accounts.tokenNonce,
      tokenTag: accounts.tokenTag,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!row) {
    throw new HarborError("ACCOUNT_NOT_FOUND", "Account not found.", 404);
  }
  return {
    id: row.id,
    label: row.label,
    enabled: row.enabled,
    token: {
      ciphertext: row.tokenCiphertext,
      nonce: row.tokenNonce,
      tag: row.tokenTag,
    },
  };
}

export async function listAccountSecrets(): Promise<AccountSecretRow[]> {
  const rows = await getDatabase()
    .select({
      id: accounts.id,
      label: accounts.label,
      enabled: accounts.enabled,
      tokenCiphertext: accounts.tokenCiphertext,
      tokenNonce: accounts.tokenNonce,
      tokenTag: accounts.tokenTag,
    })
    .from(accounts)
    .where(eq(accounts.enabled, true))
    .orderBy(asc(accounts.label));
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    enabled: row.enabled,
    token: {
      ciphertext: row.tokenCiphertext,
      nonce: row.tokenNonce,
      tag: row.tokenTag,
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

export async function listAccounts(): Promise<SanitizedAccount[]> {
  return getDatabase()
    .select({
      id: accounts.id,
      label: accounts.label,
      supabaseUserId: accounts.supabaseUserId,
      primaryEmail: accounts.primaryEmail,
      enabled: accounts.enabled,
      lastSuccessfulSyncAt: accounts.lastSuccessfulSyncAt,
      lastErrorCode: accounts.lastErrorCode,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .orderBy(asc(accounts.label));
}

function cacheQueries(
  accountId: string,
  orgs: CachedOrganization[],
  projectInputs: CachedProjectInput[],
  timestamp: string,
): BatchItem<"pg">[] {
  const queries: BatchItem<"pg">[] = [];
  for (const org of orgs) {
    queries.push(
      getDatabase()
        .insert(organizations)
        .values({
          accountId,
          supabaseOrgId: org.id,
          slug: org.slug,
          name: org.name,
          plan: org.plan,
          lastSeenAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [organizations.accountId, organizations.supabaseOrgId],
          set: {
            slug: org.slug,
            name: org.name,
            plan: org.plan,
            lastSeenAt: timestamp,
          },
        }),
    );
  }
  for (const project of projectInputs) {
    queries.push(
      getDatabase()
        .insert(projects)
        .values({
          accountId,
          projectRef: project.ref,
          supabaseOrgId: project.organizationId,
          organizationSlug: project.organizationSlug,
          name: project.name,
          region: project.region,
          cloudProvider: project.cloudProvider,
          rawStatus: project.rawStatus,
          lifecycleStatus: project.lifecycleStatus,
          healthStatus: project.healthStatus,
          createdAt: project.createdAt,
          lastSeenAt: timestamp,
          removedAt: null,
        })
        .onConflictDoUpdate({
          target: [projects.accountId, projects.projectRef],
          set: {
            supabaseOrgId: project.organizationId,
            organizationSlug: project.organizationSlug,
            name: project.name,
            region: project.region,
            cloudProvider: project.cloudProvider,
            rawStatus: project.rawStatus,
            lifecycleStatus: project.lifecycleStatus,
            healthStatus: project.healthStatus,
            lastSeenAt: timestamp,
            removedAt: null,
          },
        }),
    );
  }
  const missingProjects = and(
    eq(projects.accountId, accountId),
    isNull(projects.removedAt),
    projectInputs.length
      ? notInArray(
          projects.projectRef,
          projectInputs.map((project) => project.ref),
        )
      : undefined,
  );
  queries.push(
    getDatabase()
      .update(projects)
      .set({ removedAt: timestamp })
      .where(missingProjects),
  );
  return queries;
}

export async function insertAccountWithCache(input: {
  label: string;
  userId: string;
  primaryEmail: string;
  encryptedToken: CipherEnvelope;
  fingerprint: string;
  organizations: CachedOrganization[];
  projects: CachedProjectInput[];
}) {
  const accountId = randomUUID();
  const timestamp = now();
  try {
    await runBatch([
      getDatabase().insert(accounts).values({
        id: accountId,
        label: input.label,
        supabaseUserId: input.userId,
        primaryEmail: input.primaryEmail,
        tokenCiphertext: input.encryptedToken.ciphertext,
        tokenNonce: input.encryptedToken.nonce,
        tokenTag: input.encryptedToken.tag,
        tokenFingerprint: input.fingerprint,
        enabled: true,
        lastSuccessfulSyncAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      ...cacheQueries(
        accountId,
        input.organizations,
        input.projects,
        timestamp,
      ),
    ]);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "23505" || String(error).includes("token_fingerprint")) {
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

export async function upsertAccountCache(
  accountId: string,
  orgs: CachedOrganization[],
  projectInputs: CachedProjectInput[],
) {
  const timestamp = now();
  await runBatch([
    ...cacheQueries(accountId, orgs, projectInputs, timestamp),
    getDatabase()
      .update(accounts)
      .set({
        lastSuccessfulSyncAt: timestamp,
        lastErrorCode: null,
        updatedAt: timestamp,
      })
      .where(eq(accounts.id, accountId)),
  ]);
}

export async function setAccountError(accountId: string, errorCode: string) {
  await getDatabase()
    .update(accounts)
    .set({ lastErrorCode: errorCode, updatedAt: now() })
    .where(eq(accounts.id, accountId));
}

export async function updateAccount(
  accountId: string,
  patch: {
    label?: string;
    enabled?: boolean;
    token?: CipherEnvelope;
    fingerprint?: string;
  },
) {
  const current = await getAccountSecret(accountId);
  await getDatabase()
    .update(accounts)
    .set({
      label: patch.label ?? current.label,
      enabled: patch.enabled ?? current.enabled,
      tokenCiphertext: patch.token?.ciphertext ?? current.token.ciphertext,
      tokenNonce: patch.token?.nonce ?? current.token.nonce,
      tokenTag: patch.token?.tag ?? current.token.tag,
      tokenFingerprint: patch.fingerprint,
      updatedAt: now(),
    })
    .where(eq(accounts.id, accountId));
}

export async function deleteAccount(accountId: string) {
  await getDatabase().delete(accounts).where(eq(accounts.id, accountId));
}

export async function listProjects() {
  return getDatabase()
    .select({
      accountId: projects.accountId,
      projectRef: projects.projectRef,
      name: projects.name,
      organizationId: projects.supabaseOrgId,
      organizationName: sql<string>`coalesce(${organizations.name}, ${projects.organizationSlug})`,
      organizationPlan: sql<string>`coalesce(${organizations.plan}, 'unknown')`,
      region: projects.region,
      cloudProvider: projects.cloudProvider,
      rawStatus: projects.rawStatus,
      lifecycleStatus: projects.lifecycleStatus,
      healthStatus: projects.healthStatus,
      lastSeenAt: projects.lastSeenAt,
      removedAt: projects.removedAt,
      accountLabel: accounts.label,
      accountEmail: accounts.primaryEmail,
      accountLastSuccessfulSyncAt: accounts.lastSuccessfulSyncAt,
      accountLastErrorCode: accounts.lastErrorCode,
    })
    .from(projects)
    .innerJoin(accounts, eq(accounts.id, projects.accountId))
    .leftJoin(
      organizations,
      and(
        eq(organizations.accountId, projects.accountId),
        eq(organizations.supabaseOrgId, projects.supabaseOrgId),
      ),
    )
    .where(and(eq(accounts.enabled, true), isNull(projects.removedAt)))
    .orderBy(asc(projects.name));
}

export async function getProject(accountId: string, projectRef: string) {
  const [project] = await getDatabase()
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.accountId, accountId),
        eq(projects.projectRef, projectRef),
        isNull(projects.removedAt),
      ),
    )
    .limit(1);
  if (!project) {
    throw new HarborError("PROJECT_NOT_FOUND", "Project not found.", 404);
  }
  return project;
}

export async function updateProjectStatus(
  accountId: string,
  projectRef: string,
  rawStatus: string,
  lifecycleStatus: ProjectLifecycleStatus,
  healthStatus: ProjectHealthStatus,
) {
  await getDatabase()
    .update(projects)
    .set({
      rawStatus,
      lifecycleStatus,
      healthStatus,
      lastSeenAt: now(),
      removedAt: null,
    })
    .where(
      and(
        eq(projects.accountId, accountId),
        eq(projects.projectRef, projectRef),
      ),
    );
}

export async function replaceServiceHealth(
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
  const timestamp = now();
  await runBatch([
    getDatabase()
      .delete(serviceHealth)
      .where(
        and(
          eq(serviceHealth.accountId, accountId),
          eq(serviceHealth.projectRef, projectRef),
        ),
      ),
    ...services.map((service) =>
      getDatabase().insert(serviceHealth).values({
        accountId,
        projectRef,
        serviceName: service.name,
        healthy: service.healthy,
        rawStatus: service.status,
        version: service.version,
        errorSummary: service.error,
        checkedAt: timestamp,
      }),
    ),
  ]);
  return listServiceHealth(accountId, projectRef);
}

export async function listServiceHealth(
  accountId: string,
  projectRef: string,
) {
  return getDatabase()
    .select({
      name: serviceHealth.serviceName,
      healthy: serviceHealth.healthy,
      status: serviceHealth.rawStatus,
      version: serviceHealth.version,
      error: serviceHealth.errorSummary,
      checkedAt: serviceHealth.checkedAt,
    })
    .from(serviceHealth)
    .where(
      and(
        eq(serviceHealth.accountId, accountId),
        eq(serviceHealth.projectRef, projectRef),
      ),
    )
    .orderBy(asc(serviceHealth.serviceName));
}

export async function startSyncRun(accountId: string, trigger: string) {
  const id = randomUUID();
  await getDatabase().insert(syncRuns).values({
    id,
    accountId,
    trigger,
    status: "running",
    startedAt: now(),
  });
  return id;
}

export async function completeSyncRun(
  id: string,
  status: "completed" | "failed",
  projectCount: number,
  errorCode?: string,
) {
  await getDatabase()
    .update(syncRuns)
    .set({
      status,
      projectCount,
      errorCode: errorCode ?? null,
      completedAt: now(),
    })
    .where(eq(syncRuns.id, id));
}

export async function createAction(accountId: string, projectRef: string) {
  const id = randomUUID();
  await getDatabase().insert(actions).values({
    id,
    accountId,
    projectRef,
    actionType: "restore",
    status: "pending",
    startedAt: now(),
  });
  return id;
}

export async function updateAction(
  id: string,
  status: string,
  upstreamStatus?: string,
  errorCode?: string,
  completed = false,
) {
  await getDatabase()
    .update(actions)
    .set({
      status,
      upstreamStatus: upstreamStatus ?? null,
      errorCode: errorCode ?? null,
      completedAt: completed ? now() : undefined,
    })
    .where(eq(actions.id, id));
}

export async function getAction(id: string) {
  const [row] = await getDatabase()
    .select()
    .from(actions)
    .where(eq(actions.id, id))
    .limit(1);
  if (!row) throw new HarborError("ACTION_NOT_FOUND", "Action not found.", 404);
  return row;
}

export async function listActivity() {
  const [actionRows, refreshRows] = await Promise.all([
    getDatabase()
      .select({
        id: actions.id,
        type: actions.actionType,
        status: actions.status,
        projectRef: actions.projectRef,
        accountLabel: accounts.label,
        projectName: projects.name,
        errorCode: actions.errorCode,
        startedAt: actions.startedAt,
        completedAt: actions.completedAt,
      })
      .from(actions)
      .innerJoin(accounts, eq(accounts.id, actions.accountId))
      .leftJoin(
        projects,
        and(
          eq(projects.accountId, actions.accountId),
          eq(projects.projectRef, actions.projectRef),
        ),
      ),
    getDatabase()
      .select({
        id: syncRuns.id,
        type: sql<string>`'refresh'`,
        status: syncRuns.status,
        projectRef: sql<null>`null`,
        accountLabel: accounts.label,
        projectName: sql<null>`null`,
        errorCode: syncRuns.errorCode,
        startedAt: syncRuns.startedAt,
        completedAt: syncRuns.completedAt,
      })
      .from(syncRuns)
      .innerJoin(accounts, eq(accounts.id, syncRuns.accountId)),
  ]);
  return [...actionRows, ...refreshRows].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export async function getSettings() {
  const rows = await getDatabase()
    .select({ key: settings.key, value: settings.value })
    .from(settings);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function updateSettings(values: Record<string, string>) {
  const timestamp = now();
  await runBatch(
    Object.entries(values).map(([key, value]) =>
      getDatabase()
        .insert(settings)
        .values({ key, value, updatedAt: timestamp })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: timestamp },
        }),
    ),
  );
  return getSettings();
}

export async function resetTestDatabase() {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.ALLOW_DATABASE_RESET !== "1"
  ) {
    throw new Error("Test database reset is not authorized.");
  }
  const result = await getDatabase().execute<{ database: string }>(
    sql`select current_database() as database`,
  );
  if (result.rows[0]?.database !== "harbor_test") {
    throw new Error("Refusing to reset a database other than harbor_test.");
  }
  await getDatabase().execute(
    sql`truncate table ${actions}, ${syncRuns}, ${serviceHealth}, ${projects}, ${organizations}, ${accounts}, ${vaultMetadata}, ${settings} cascade`,
  );
  await getDatabase()
    .insert(settings)
    .values([
      { key: "refresh_interval_minutes", value: "5" },
      { key: "idle_timeout_minutes", value: "30" },
    ])
    .onConflictDoNothing();
}
