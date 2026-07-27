import pLimit from "p-limit";
import { HarborError } from "@/shared/errors/harbor-error";
import { decryptHostedToken } from "@/server/crypto/hosted-crypto";
import {
  completeSyncRun,
  listAccountSecrets,
  setAccountError,
  startSyncRun,
  upsertAccountCache,
} from "@/server/database/repository";
import { supabaseManagement } from "@/server/supabase/client";
import { normalizeProjectStatus } from "@/server/supabase/status";
import type { TenantContext } from "@/shared/types/auth";

async function refreshAccount(
  context: TenantContext,
  account: Awaited<ReturnType<typeof listAccountSecrets>>[number],
  dek: Buffer,
  trigger: string,
) {
  const runId = await startSyncRun(context, account.id, trigger);
  const token = decryptHostedToken(
    account.token,
    context.userId,
    account.id,
    dek,
  );
  try {
    const [organizations, projects] = await Promise.all([
      supabaseManagement.organizations(token),
      supabaseManagement.projects(token),
    ]);
    const orgMap = new Map(organizations.map((org) => [org.id, org]));
    await upsertAccountCache(
      context,
      account.id,
      organizations.map((org) => ({
        id: org.id,
        slug: org.slug ?? org.id,
        name: org.name,
        plan: org.plan ?? "unknown",
      })),
      projects.map((project) => ({
        ref: project.ref,
        organizationId: project.organization_id ?? "unknown",
        organizationSlug:
          project.organization_slug ??
          (project.organization_id
            ? orgMap.get(project.organization_id)?.slug
            : undefined) ??
          "",
        name: project.name,
        region: project.region,
        cloudProvider: project.cloud_provider ?? "unknown",
        rawStatus: project.status,
        ...normalizeProjectStatus(project.status),
        createdAt: project.created_at ?? new Date().toISOString(),
      })),
    );
    await completeSyncRun(context, runId, "completed", projects.length);
    return { accountId: account.id, ok: true, projectCount: projects.length };
  } catch (error) {
    const code =
      error instanceof HarborError ? error.code : "UNEXPECTED_REFRESH_ERROR";
    await setAccountError(context, account.id, code);
    await completeSyncRun(context, runId, "failed", 0, code);
    return { accountId: account.id, ok: false, errorCode: code };
  }
}

export async function refreshAllAccounts(
  context: TenantContext,
  dek: Buffer,
  trigger = "manual",
) {
  const limit = pLimit(3);
  const accounts = await listAccountSecrets(context);
  return Promise.all(
    accounts.map((account) =>
      limit(() => refreshAccount(context, account, dek, trigger)),
    ),
  );
}

export async function refreshOneAccount(
  context: TenantContext,
  accountId: string,
  dek: Buffer,
  trigger = "manual",
) {
  const account = (await listAccountSecrets(context)).find(
    (item) => item.id === accountId,
  );
  if (!account) {
    throw new HarborError("ACCOUNT_NOT_FOUND", "Account not found.", 404);
  }
  return refreshAccount(context, account, dek, trigger);
}
