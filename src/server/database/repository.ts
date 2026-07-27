import { randomUUID } from "node:crypto";
import type { BatchItem } from "drizzle-orm/batch";
import { and, asc, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import type {
  CipherEnvelope,
  UserVaultRecord,
} from "@/server/crypto/hosted-crypto";
import { getDatabase } from "@/server/database/client";
import {
  accounts,
  actions,
  keepaliveAttempts,
  keepaliveEnrollments,
  keepaliveJobs,
  organizations,
  projects,
  serviceHealth,
  settings,
  syncRuns,
  userVaults,
} from "@/server/database/schema";
import { HarborError } from "@/shared/errors/harbor-error";
import type {
  ProjectHealthStatus,
  ProjectLifecycleStatus,
} from "@/shared/types/api";
import type { TenantContext } from "@/shared/types/auth";

const now = () => new Date().toISOString();

async function runTenantBatch(
  context: TenantContext,
  queries: BatchItem<"pg">[],
) {
  if (queries.length === 0) return [];
  const results = await getDatabase().batch([
    getDatabase().execute(sql.raw("set local role harbor_runtime")),
    getDatabase().execute(
      sql`select set_config('harbor.user_id', ${context.userId}, true)`,
    ),
    ...queries,
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return results.slice(2);
}

async function runTenantQuery<T>(
  context: TenantContext,
  query: BatchItem<"pg">,
) {
  const [result] = await runTenantBatch(context, [query]);
  return result as T;
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

export async function resolveGithubId(userId: string) {
  const [, result] = await getDatabase().batch([
    getDatabase().execute(sql.raw("set local role harbor_runtime")),
    getDatabase().execute<{ githubId: string | null }>(
      sql`select public.harbor_github_id(${userId}) as "githubId"`,
    ),
  ]);
  return result.rows[0]?.githubId ?? null;
}

export async function getUserVault(
  context: TenantContext,
): Promise<UserVaultRecord | null> {
  const rows = await runTenantQuery<(typeof userVaults.$inferSelect)[]>(
    context,
    getDatabase()
      .select()
      .from(userVaults)
      .where(eq(userVaults.userId, context.userId))
      .limit(1),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    wrappedDek: row.wrappedDek,
    wrappedDekNonce: row.wrappedDekNonce,
    wrappedDekTag: row.wrappedDekTag,
    rootKeyVersion: row.rootKeyVersion,
  };
}

export async function insertUserVault(
  context: TenantContext,
  record: UserVaultRecord,
) {
  await runTenantBatch(context, [
    getDatabase()
      .insert(userVaults)
      .values({
        userId: context.userId,
        wrappedDek: record.wrappedDek,
        wrappedDekNonce: record.wrappedDekNonce,
        wrappedDekTag: record.wrappedDekTag,
        rootKeyVersion: record.rootKeyVersion,
      })
      .onConflictDoNothing({ target: userVaults.userId }),
  ]);
}

export async function updateUserVault(
  context: TenantContext,
  record: UserVaultRecord,
) {
  await runTenantBatch(context, [
    getDatabase()
      .update(userVaults)
      .set({
        wrappedDek: record.wrappedDek,
        wrappedDekNonce: record.wrappedDekNonce,
        wrappedDekTag: record.wrappedDekTag,
        rootKeyVersion: record.rootKeyVersion,
        updatedAt: now(),
      })
      .where(eq(userVaults.userId, context.userId)),
  ]);
}

export type AccountSecretRow = {
  id: string;
  label: string;
  enabled: boolean;
  token: CipherEnvelope;
};

export async function getAccountSecret(
  context: TenantContext,
  accountId: string,
): Promise<AccountSecretRow> {
  const rows = await runTenantQuery<
    Array<{
      id: string;
      label: string;
      enabled: boolean;
      tokenCiphertext: Buffer;
      tokenNonce: Buffer;
      tokenTag: Buffer;
    }>
  >(
    context,
    getDatabase()
      .select({
        id: accounts.id,
        label: accounts.label,
        enabled: accounts.enabled,
        tokenCiphertext: accounts.tokenCiphertext,
        tokenNonce: accounts.tokenNonce,
        tokenTag: accounts.tokenTag,
      })
      .from(accounts)
      .where(
        and(eq(accounts.userId, context.userId), eq(accounts.id, accountId)),
      )
      .limit(1),
  );
  const row = rows[0];
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

export async function listAccountSecrets(
  context: TenantContext,
): Promise<AccountSecretRow[]> {
  const rows = await runTenantQuery<
    Array<{
      id: string;
      label: string;
      enabled: boolean;
      tokenCiphertext: Buffer;
      tokenNonce: Buffer;
      tokenTag: Buffer;
    }>
  >(
    context,
    getDatabase()
      .select({
        id: accounts.id,
        label: accounts.label,
        enabled: accounts.enabled,
        tokenCiphertext: accounts.tokenCiphertext,
        tokenNonce: accounts.tokenNonce,
        tokenTag: accounts.tokenTag,
      })
      .from(accounts)
      .where(
        and(eq(accounts.userId, context.userId), eq(accounts.enabled, true)),
      )
      .orderBy(asc(accounts.label)),
  );
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

export async function listAccounts(
  context: TenantContext,
): Promise<SanitizedAccount[]> {
  return runTenantQuery<SanitizedAccount[]>(
    context,
    getDatabase()
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
      .where(eq(accounts.userId, context.userId))
      .orderBy(asc(accounts.label)),
  );
}

function cacheQueries(
  context: TenantContext,
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
          userId: context.userId,
          accountId,
          supabaseOrgId: org.id,
          slug: org.slug,
          name: org.name,
          plan: org.plan,
          lastSeenAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [
            organizations.userId,
            organizations.accountId,
            organizations.supabaseOrgId,
          ],
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
          userId: context.userId,
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
          target: [projects.userId, projects.accountId, projects.projectRef],
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
    eq(projects.userId, context.userId),
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
  context: TenantContext;
  accountId?: string;
  label: string;
  userId: string;
  primaryEmail: string;
  encryptedToken: CipherEnvelope;
  fingerprint: string;
  organizations: CachedOrganization[];
  projects: CachedProjectInput[];
}) {
  const accountId = input.accountId ?? randomUUID();
  const timestamp = now();
  try {
    await runTenantBatch(input.context, [
      getDatabase().insert(accounts).values({
        userId: input.context.userId,
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
        input.context,
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
  context: TenantContext,
  accountId: string,
  orgs: CachedOrganization[],
  projectInputs: CachedProjectInput[],
) {
  const timestamp = now();
  await runTenantBatch(context, [
    ...cacheQueries(context, accountId, orgs, projectInputs, timestamp),
    getDatabase()
      .update(accounts)
      .set({
        lastSuccessfulSyncAt: timestamp,
        lastErrorCode: null,
        updatedAt: timestamp,
      })
      .where(
        and(eq(accounts.userId, context.userId), eq(accounts.id, accountId)),
      ),
  ]);
}

export async function setAccountError(
  context: TenantContext,
  accountId: string,
  errorCode: string,
) {
  await runTenantBatch(context, [
    getDatabase()
      .update(accounts)
      .set({ lastErrorCode: errorCode, updatedAt: now() })
      .where(
        and(eq(accounts.userId, context.userId), eq(accounts.id, accountId)),
      ),
  ]);
}

export async function updateAccount(
  context: TenantContext,
  accountId: string,
  patch: {
    label?: string;
    enabled?: boolean;
    token?: CipherEnvelope;
    fingerprint?: string;
  },
) {
  const current = await getAccountSecret(context, accountId);
  await runTenantBatch(context, [
    getDatabase()
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
      .where(
        and(eq(accounts.userId, context.userId), eq(accounts.id, accountId)),
      ),
  ]);
}

export async function deleteAccount(context: TenantContext, accountId: string) {
  await runTenantBatch(context, [
    getDatabase()
      .delete(accounts)
      .where(
        and(eq(accounts.userId, context.userId), eq(accounts.id, accountId)),
      ),
  ]);
}

export async function listProjects(context: TenantContext) {
  return runTenantQuery<
    Array<{
      accountId: string;
      projectRef: string;
      name: string;
      organizationId: string;
      organizationName: string;
      organizationPlan: string;
      region: string;
      cloudProvider: string;
      rawStatus: string;
      lifecycleStatus: string;
      healthStatus: string;
      lastSeenAt: string;
      removedAt: string | null;
      accountLabel: string;
      accountEmail: string;
      accountLastSuccessfulSyncAt: string | null;
      accountLastErrorCode: string | null;
      keepaliveEnrolled: boolean;
      keepaliveEnabled: boolean | null;
      keepaliveLastAttemptAt: string | null;
      keepaliveLastSuccessAt: string | null;
      keepaliveLastErrorCode: string | null;
      keepaliveNeedsAttention: boolean | null;
    }>
  >(
    context,
    getDatabase()
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
        keepaliveEnrolled: sql<boolean>`${keepaliveEnrollments.userId} is not null`,
        keepaliveEnabled: keepaliveEnrollments.enabled,
        keepaliveLastAttemptAt: keepaliveEnrollments.lastAttemptAt,
        keepaliveLastSuccessAt: keepaliveEnrollments.lastSuccessAt,
        keepaliveLastErrorCode: keepaliveEnrollments.lastErrorCode,
        keepaliveNeedsAttention: keepaliveEnrollments.needsAttention,
      })
      .from(projects)
      .innerJoin(
        accounts,
        and(
          eq(accounts.userId, projects.userId),
          eq(accounts.id, projects.accountId),
        ),
      )
      .leftJoin(
        organizations,
        and(
          eq(organizations.userId, projects.userId),
          eq(organizations.accountId, projects.accountId),
          eq(organizations.supabaseOrgId, projects.supabaseOrgId),
        ),
      )
      .leftJoin(
        keepaliveEnrollments,
        and(
          eq(keepaliveEnrollments.userId, projects.userId),
          eq(keepaliveEnrollments.accountId, projects.accountId),
          eq(keepaliveEnrollments.projectRef, projects.projectRef),
        ),
      )
      .where(
        and(
          eq(projects.userId, context.userId),
          eq(accounts.enabled, true),
          isNull(projects.removedAt),
        ),
      )
      .orderBy(asc(projects.name)),
  );
}

export async function getProject(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  const rows = await runTenantQuery<(typeof projects.$inferSelect)[]>(
    context,
    getDatabase()
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.userId, context.userId),
          eq(projects.accountId, accountId),
          eq(projects.projectRef, projectRef),
          isNull(projects.removedAt),
        ),
      )
      .limit(1),
  );
  const project = rows[0];
  if (!project) {
    throw new HarborError("PROJECT_NOT_FOUND", "Project not found.", 404);
  }
  return project;
}

export async function updateProjectStatus(
  context: TenantContext,
  accountId: string,
  projectRef: string,
  rawStatus: string,
  lifecycleStatus: ProjectLifecycleStatus,
  healthStatus: ProjectHealthStatus,
) {
  await runTenantBatch(context, [
    getDatabase()
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
          eq(projects.userId, context.userId),
          eq(projects.accountId, accountId),
          eq(projects.projectRef, projectRef),
        ),
      ),
  ]);
}

export async function replaceServiceHealth(
  context: TenantContext,
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
  await runTenantBatch(context, [
    getDatabase()
      .delete(serviceHealth)
      .where(
        and(
          eq(serviceHealth.userId, context.userId),
          eq(serviceHealth.accountId, accountId),
          eq(serviceHealth.projectRef, projectRef),
        ),
      ),
    ...services.map((service) =>
      getDatabase().insert(serviceHealth).values({
        userId: context.userId,
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
  return listServiceHealth(context, accountId, projectRef);
}

export async function listServiceHealth(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  return runTenantQuery<
    Array<{
      name: string;
      healthy: boolean;
      status: string;
      version: string | null;
      error: string | null;
      checkedAt: string;
    }>
  >(
    context,
    getDatabase()
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
          eq(serviceHealth.userId, context.userId),
          eq(serviceHealth.accountId, accountId),
          eq(serviceHealth.projectRef, projectRef),
        ),
      )
      .orderBy(asc(serviceHealth.serviceName)),
  );
}

export async function startSyncRun(
  context: TenantContext,
  accountId: string,
  trigger: string,
) {
  const id = randomUUID();
  await runTenantBatch(context, [
    getDatabase().insert(syncRuns).values({
      userId: context.userId,
      id,
      accountId,
      trigger,
      status: "running",
      startedAt: now(),
    }),
  ]);
  return id;
}

export async function completeSyncRun(
  context: TenantContext,
  id: string,
  status: "completed" | "failed",
  projectCount: number,
  errorCode?: string,
) {
  await runTenantBatch(context, [
    getDatabase()
      .update(syncRuns)
      .set({
        status,
        projectCount,
        errorCode: errorCode ?? null,
        completedAt: now(),
      })
      .where(and(eq(syncRuns.userId, context.userId), eq(syncRuns.id, id))),
  ]);
}

export async function createAction(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  const id = randomUUID();
  await runTenantBatch(context, [
    getDatabase().insert(actions).values({
      userId: context.userId,
      id,
      accountId,
      projectRef,
      actionType: "restore",
      status: "pending",
      startedAt: now(),
    }),
  ]);
  return id;
}

export async function updateAction(
  context: TenantContext,
  id: string,
  status: string,
  upstreamStatus?: string,
  errorCode?: string,
  completed = false,
) {
  await runTenantBatch(context, [
    getDatabase()
      .update(actions)
      .set({
        status,
        upstreamStatus: upstreamStatus ?? null,
        errorCode: errorCode ?? null,
        completedAt: completed ? now() : undefined,
      })
      .where(and(eq(actions.userId, context.userId), eq(actions.id, id))),
  ]);
}

export async function getAction(context: TenantContext, id: string) {
  const rows = await runTenantQuery<(typeof actions.$inferSelect)[]>(
    context,
    getDatabase()
      .select()
      .from(actions)
      .where(and(eq(actions.userId, context.userId), eq(actions.id, id)))
      .limit(1),
  );
  const row = rows[0];
  if (!row) throw new HarborError("ACTION_NOT_FOUND", "Action not found.", 404);
  return row;
}

export async function listActivity(context: TenantContext) {
  const [actionRows, refreshRows] = await Promise.all([
    runTenantQuery<
      Array<{
        id: string;
        type: string;
        status: string;
        projectRef: string;
        accountLabel: string;
        projectName: string | null;
        errorCode: string | null;
        startedAt: string;
        completedAt: string | null;
      }>
    >(
      context,
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
        .innerJoin(
          accounts,
          and(
            eq(accounts.userId, actions.userId),
            eq(accounts.id, actions.accountId),
          ),
        )
        .leftJoin(
          projects,
          and(
            eq(projects.userId, actions.userId),
            eq(projects.accountId, actions.accountId),
            eq(projects.projectRef, actions.projectRef),
          ),
        )
        .where(eq(actions.userId, context.userId)),
    ),
    runTenantQuery<
      Array<{
        id: string;
        type: string;
        status: string;
        projectRef: null;
        accountLabel: string;
        projectName: null;
        errorCode: string | null;
        startedAt: string;
        completedAt: string | null;
      }>
    >(
      context,
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
        .innerJoin(
          accounts,
          and(
            eq(accounts.userId, syncRuns.userId),
            eq(accounts.id, syncRuns.accountId),
          ),
        )
        .where(eq(syncRuns.userId, context.userId)),
    ),
  ]);
  return [...actionRows, ...refreshRows].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export type KeepaliveEnrollmentRecord = {
  accountId: string;
  projectRef: string;
  enabled: boolean;
  credentialSource: "automatic" | "manual";
  credentialType: "publishable" | "legacy_anon";
  nextRunAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  consecutiveFailures: number;
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getKeepaliveEnrollment(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  const rows = await runTenantQuery<
    (typeof keepaliveEnrollments.$inferSelect)[]
  >(
    context,
    getDatabase()
      .select()
      .from(keepaliveEnrollments)
      .where(
        and(
          eq(keepaliveEnrollments.userId, context.userId),
          eq(keepaliveEnrollments.accountId, accountId),
          eq(keepaliveEnrollments.projectRef, projectRef),
        ),
      )
      .limit(1),
  );
  return rows[0] ?? null;
}

export async function listKeepaliveEnrollments(
  context: TenantContext,
): Promise<KeepaliveEnrollmentRecord[]> {
  return runTenantQuery<KeepaliveEnrollmentRecord[]>(
    context,
    getDatabase()
      .select({
        accountId: keepaliveEnrollments.accountId,
        projectRef: keepaliveEnrollments.projectRef,
        enabled: keepaliveEnrollments.enabled,
        credentialSource: keepaliveEnrollments.credentialSource,
        credentialType: keepaliveEnrollments.credentialType,
        nextRunAt: keepaliveEnrollments.nextRunAt,
        lastAttemptAt: keepaliveEnrollments.lastAttemptAt,
        lastSuccessAt: keepaliveEnrollments.lastSuccessAt,
        lastErrorCode: keepaliveEnrollments.lastErrorCode,
        consecutiveFailures: keepaliveEnrollments.consecutiveFailures,
        needsAttention: keepaliveEnrollments.needsAttention,
        createdAt: keepaliveEnrollments.createdAt,
        updatedAt: keepaliveEnrollments.updatedAt,
      })
      .from(keepaliveEnrollments)
      .where(eq(keepaliveEnrollments.userId, context.userId))
      .orderBy(asc(keepaliveEnrollments.nextRunAt)),
  );
}

export async function upsertKeepaliveEnrollment(input: {
  context: TenantContext;
  accountId: string;
  projectRef: string;
  credential: CipherEnvelope;
  credentialFingerprint: string;
  credentialType: "publishable" | "legacy_anon";
  credentialSource: "automatic" | "manual";
  credentialKeyId?: string | null;
  verifiedAt: string;
  nextRunAt: string;
  validation?: {
    durationMs: number;
    upstreamStatus: number;
  };
}) {
  const timestamp = now();
  const validationJobId = input.validation ? randomUUID() : null;
  const validationStartedAt = input.validation
    ? new Date(
        Date.parse(input.verifiedAt) - input.validation.durationMs,
      ).toISOString()
    : null;
  const queries: BatchItem<"pg">[] = [
    getDatabase()
      .insert(keepaliveEnrollments)
      .values({
        userId: input.context.userId,
        accountId: input.accountId,
        projectRef: input.projectRef,
        enabled: true,
        credentialCiphertext: input.credential.ciphertext,
        credentialNonce: input.credential.nonce,
        credentialTag: input.credential.tag,
        credentialFingerprint: input.credentialFingerprint,
        credentialType: input.credentialType,
        credentialSource: input.credentialSource,
        credentialKeyId: input.credentialKeyId,
        nextRunAt: input.nextRunAt,
        lastAttemptAt: input.verifiedAt,
        lastSuccessAt: input.verifiedAt,
        lastErrorCode: null,
        consecutiveFailures: 0,
        needsAttention: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [
          keepaliveEnrollments.userId,
          keepaliveEnrollments.accountId,
          keepaliveEnrollments.projectRef,
        ],
        set: {
          enabled: true,
          credentialCiphertext: input.credential.ciphertext,
          credentialNonce: input.credential.nonce,
          credentialTag: input.credential.tag,
          credentialFingerprint: input.credentialFingerprint,
          credentialType: input.credentialType,
          credentialSource: input.credentialSource,
          credentialKeyId: input.credentialKeyId,
          nextRunAt: input.nextRunAt,
          lastAttemptAt: input.verifiedAt,
          lastSuccessAt: input.verifiedAt,
          lastErrorCode: null,
          consecutiveFailures: 0,
          needsAttention: false,
          updatedAt: timestamp,
        },
      }),
  ];
  if (input.validation && validationJobId && validationStartedAt) {
    queries.push(
      getDatabase().insert(keepaliveJobs).values({
        userId: input.context.userId,
        id: validationJobId,
        accountId: input.accountId,
        projectRef: input.projectRef,
        trigger: "enrollment_validation",
        status: "succeeded",
        scheduledFor: input.verifiedAt,
        availableAt: input.verifiedAt,
        attemptCount: 1,
        maxAttempts: 1,
        lastUpstreamStatus: input.validation.upstreamStatus,
        startedAt: validationStartedAt,
        completedAt: input.verifiedAt,
      }),
      getDatabase().insert(keepaliveAttempts).values({
        userId: input.context.userId,
        id: randomUUID(),
        jobId: validationJobId,
        accountId: input.accountId,
        projectRef: input.projectRef,
        attemptNumber: 1,
        status: "succeeded",
        upstreamStatus: input.validation.upstreamStatus,
        workerId: "web-enrollment",
        durationMs: input.validation.durationMs,
        startedAt: validationStartedAt,
        completedAt: input.verifiedAt,
      }),
    );
  }
  await runTenantBatch(input.context, queries);
}

export async function setKeepaliveEnabled(
  context: TenantContext,
  accountId: string,
  projectRef: string,
  enabled: boolean,
) {
  const rows = await runTenantQuery<Array<{ accountId: string }>>(
    context,
    getDatabase()
      .update(keepaliveEnrollments)
      .set({
        enabled,
        nextRunAt: enabled ? now() : undefined,
        updatedAt: now(),
      })
      .where(
        and(
          eq(keepaliveEnrollments.userId, context.userId),
          eq(keepaliveEnrollments.accountId, accountId),
          eq(keepaliveEnrollments.projectRef, projectRef),
        ),
      )
      .returning({ accountId: keepaliveEnrollments.accountId }),
  );
  if (!rows[0]) {
    throw new HarborError(
      "KEEPALIVE_NOT_ENROLLED",
      "This project is not enrolled for heartbeat activity.",
      404,
    );
  }
  if (!enabled) {
    await runTenantBatch(context, [
      getDatabase()
        .update(keepaliveJobs)
        .set({ status: "cancelled", completedAt: now(), updatedAt: now() })
        .where(
          and(
            eq(keepaliveJobs.userId, context.userId),
            eq(keepaliveJobs.accountId, accountId),
            eq(keepaliveJobs.projectRef, projectRef),
            notInArray(keepaliveJobs.status, [
              "succeeded",
              "failed",
              "cancelled",
            ]),
          ),
        ),
    ]);
  }
}

export async function deleteKeepaliveEnrollment(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  const rows = await runTenantQuery<Array<{ accountId: string }>>(
    context,
    getDatabase()
      .delete(keepaliveEnrollments)
      .where(
        and(
          eq(keepaliveEnrollments.userId, context.userId),
          eq(keepaliveEnrollments.accountId, accountId),
          eq(keepaliveEnrollments.projectRef, projectRef),
        ),
      )
      .returning({ accountId: keepaliveEnrollments.accountId }),
  );
  if (!rows[0]) {
    throw new HarborError(
      "KEEPALIVE_NOT_ENROLLED",
      "This project is not enrolled for heartbeat activity.",
      404,
    );
  }
}

export async function queueKeepaliveJob(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  const enrollment = await getKeepaliveEnrollment(
    context,
    accountId,
    projectRef,
  );
  if (!enrollment?.enabled) {
    throw new HarborError(
      "KEEPALIVE_NOT_ENABLED",
      "Enable heartbeat activity before queuing a run.",
      409,
    );
  }
  const scheduledFor = new Date(
    Math.floor(Date.now() / 10_000) * 10_000,
  ).toISOString();
  const id = randomUUID();
  await runTenantBatch(context, [
    getDatabase()
      .insert(keepaliveJobs)
      .values({
        userId: context.userId,
        id,
        accountId,
        projectRef,
        trigger: "manual",
        status: "pending",
        scheduledFor,
        availableAt: now(),
      })
      .onConflictDoNothing(),
  ]);
  const rows = await runTenantQuery<Array<{ id: string }>>(
    context,
    getDatabase()
      .select({ id: keepaliveJobs.id })
      .from(keepaliveJobs)
      .where(
        and(
          eq(keepaliveJobs.userId, context.userId),
          eq(keepaliveJobs.accountId, accountId),
          eq(keepaliveJobs.projectRef, projectRef),
          eq(keepaliveJobs.trigger, "manual"),
          eq(keepaliveJobs.scheduledFor, scheduledFor),
        ),
      )
      .limit(1),
  );
  return rows[0]?.id ?? id;
}

export async function listKeepaliveJobs(context: TenantContext, limit = 50) {
  return runTenantQuery<
    Array<{
      id: string;
      accountId: string;
      projectRef: string;
      trigger: string;
      status: string;
      scheduledFor: string;
      attemptCount: number;
      lastErrorCode: string | null;
      completedAt: string | null;
    }>
  >(
    context,
    getDatabase()
      .select({
        id: keepaliveJobs.id,
        accountId: keepaliveJobs.accountId,
        projectRef: keepaliveJobs.projectRef,
        trigger: keepaliveJobs.trigger,
        status: keepaliveJobs.status,
        scheduledFor: keepaliveJobs.scheduledFor,
        attemptCount: keepaliveJobs.attemptCount,
        lastErrorCode: keepaliveJobs.lastErrorCode,
        completedAt: keepaliveJobs.completedAt,
      })
      .from(keepaliveJobs)
      .where(eq(keepaliveJobs.userId, context.userId))
      .orderBy(desc(keepaliveJobs.scheduledFor))
      .limit(Math.max(1, Math.min(limit, 100))),
  );
}

export async function listKeepaliveAttempts(
  context: TenantContext,
  limit = 50,
) {
  return runTenantQuery<
    Array<{
      id: string;
      jobId: string;
      accountId: string;
      projectRef: string;
      attemptNumber: number;
      status: string;
      errorCode: string | null;
      upstreamStatus: number | null;
      durationMs: number;
      startedAt: string;
      completedAt: string;
    }>
  >(
    context,
    getDatabase()
      .select({
        id: keepaliveAttempts.id,
        jobId: keepaliveAttempts.jobId,
        accountId: keepaliveAttempts.accountId,
        projectRef: keepaliveAttempts.projectRef,
        attemptNumber: keepaliveAttempts.attemptNumber,
        status: keepaliveAttempts.status,
        errorCode: keepaliveAttempts.errorCode,
        upstreamStatus: keepaliveAttempts.upstreamStatus,
        durationMs: keepaliveAttempts.durationMs,
        startedAt: keepaliveAttempts.startedAt,
        completedAt: keepaliveAttempts.completedAt,
      })
      .from(keepaliveAttempts)
      .where(eq(keepaliveAttempts.userId, context.userId))
      .orderBy(desc(keepaliveAttempts.startedAt))
      .limit(Math.max(1, Math.min(limit, 100))),
  );
}

export async function getSettings(context: TenantContext) {
  const rows = await runTenantQuery<Array<{ key: string; value: string }>>(
    context,
    getDatabase()
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.userId, context.userId)),
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function ensureDefaultSettings(context: TenantContext) {
  const timestamp = now();
  await runTenantBatch(context, [
    getDatabase()
      .insert(settings)
      .values([
        {
          userId: context.userId,
          key: "refresh_interval_minutes",
          value: "5",
          updatedAt: timestamp,
        },
        {
          userId: context.userId,
          key: "idle_timeout_minutes",
          value: "30",
          updatedAt: timestamp,
        },
      ])
      .onConflictDoNothing(),
  ]);
}

export async function updateSettings(
  context: TenantContext,
  values: Record<string, string>,
) {
  const timestamp = now();
  await runTenantBatch(
    context,
    Object.entries(values).map(([key, value]) =>
      getDatabase()
        .insert(settings)
        .values({ userId: context.userId, key, value, updatedAt: timestamp })
        .onConflictDoUpdate({
          target: [settings.userId, settings.key],
          set: { value, updatedAt: timestamp },
        }),
    ),
  );
  return getSettings(context);
}

export async function deleteTenantData(context: TenantContext) {
  await runTenantBatch(context, [
    getDatabase().delete(accounts).where(eq(accounts.userId, context.userId)),
    getDatabase().delete(settings).where(eq(settings.userId, context.userId)),
    getDatabase()
      .delete(userVaults)
      .where(eq(userVaults.userId, context.userId)),
  ]);
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
    sql`truncate table ${keepaliveAttempts}, ${keepaliveJobs}, ${keepaliveEnrollments}, ${actions}, ${syncRuns}, ${serviceHealth}, ${projects}, ${organizations}, ${accounts}, ${userVaults}, ${settings} cascade`,
  );
  await getDatabase()
    .insert(settings)
    .values([
      {
        userId: "__integration_test__",
        key: "refresh_interval_minutes",
        value: "5",
      },
      {
        userId: "__integration_test__",
        key: "idle_timeout_minutes",
        value: "30",
      },
    ])
    .onConflictDoNothing();
}
