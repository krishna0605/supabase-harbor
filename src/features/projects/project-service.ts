import { HarborError } from "@/shared/errors/harbor-error";
import { revealAccountToken } from "@/features/accounts/account-service";
import {
  createAction,
  getAction,
  getProject,
  listProjects,
  listServiceHealth,
  replaceServiceHealth,
  updateAction,
  updateProjectStatus,
} from "@/server/database/repository";
import { supabaseManagement } from "@/server/supabase/client";
import { normalizeProjectStatus } from "@/server/supabase/status";
import type { TenantContext } from "@/shared/types/auth";

export async function cachedProjects(context: TenantContext) {
  return listProjects(context);
}

export async function refreshProjectHealth(
  context: TenantContext,
  accountId: string,
  projectRef: string,
  dek: Buffer,
) {
  await getProject(context, accountId, projectRef);
  const token = await revealAccountToken(context, accountId, dek);
  const services = await supabaseManagement.health(
    token,
    projectRef,
    accountId,
  );
  return await replaceServiceHealth(
    context,
    accountId,
    projectRef,
    services.map((service) => ({
      name: service.name,
      healthy: service.healthy,
      status: service.status,
      version: service.info?.version,
      error: service.error ?? undefined,
    })),
  );
}

export async function cachedProjectHealth(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  return listServiceHealth(context, accountId, projectRef);
}

export async function restoreProject(
  context: TenantContext,
  accountId: string,
  projectRef: string,
  dek: Buffer,
) {
  const project = await getProject(context, accountId, projectRef);
  if (project.rawStatus !== "INACTIVE") {
    throw new HarborError(
      "PROJECT_NOT_PAUSED",
      "Only paused projects can be restored.",
      409,
    );
  }
  const actionId = await createAction(context, accountId, projectRef);
  const token = await revealAccountToken(context, accountId, dek);
  try {
    await supabaseManagement.restore(token, projectRef, accountId);
    await updateAction(context, actionId, "accepted", "RESTORING");
    await updateProjectStatus(
      context,
      accountId,
      projectRef,
      "RESTORING",
      "transitioning",
      "unknown",
    );
    return await getAction(context, actionId);
  } catch (error) {
    const code =
      error instanceof HarborError ? error.code : "RESTORE_REQUEST_FAILED";
    await updateAction(context, actionId, "failed", undefined, code, true);
    throw error;
  }
}

export async function reconcileAction(
  context: TenantContext,
  actionId: string,
  dek: Buffer,
) {
  const action = await getAction(context, actionId);
  if (action.status === "completed" || action.status === "failed")
    return action;
  const token = await revealAccountToken(context, action.accountId, dek);
  const project = await supabaseManagement.project(
    token,
    action.projectRef,
    action.accountId,
  );
  const normalized = normalizeProjectStatus(project.status);
  await updateProjectStatus(
    context,
    action.accountId,
    action.projectRef,
    project.status,
    normalized.lifecycleStatus,
    normalized.healthStatus,
  );
  if (normalized.lifecycleStatus === "active") {
    await updateAction(
      context,
      actionId,
      "completed",
      project.status,
      undefined,
      true,
    );
  } else if (normalized.lifecycleStatus === "failed") {
    await updateAction(
      context,
      actionId,
      "failed",
      project.status,
      project.status,
      true,
    );
  } else {
    await updateAction(context, actionId, "accepted", project.status);
  }
  return await getAction(context, actionId);
}
