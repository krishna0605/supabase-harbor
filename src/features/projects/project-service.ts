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

export async function cachedProjects() {
  return listProjects();
}

export async function refreshProjectHealth(
  accountId: string,
  projectRef: string,
  dek: Buffer,
) {
  await getProject(accountId, projectRef);
  const token = await revealAccountToken(accountId, dek);
  const services = await supabaseManagement.health(
    token,
    projectRef,
    accountId,
  );
  return await replaceServiceHealth(
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

export async function cachedProjectHealth(accountId: string, projectRef: string) {
  return listServiceHealth(accountId, projectRef);
}

export async function restoreProject(
  accountId: string,
  projectRef: string,
  dek: Buffer,
) {
  const project = await getProject(accountId, projectRef);
  if (project.rawStatus !== "INACTIVE") {
    throw new HarborError(
      "PROJECT_NOT_PAUSED",
      "Only paused projects can be restored.",
      409,
    );
  }
  const actionId = await createAction(accountId, projectRef);
  const token = await revealAccountToken(accountId, dek);
  try {
    await supabaseManagement.restore(token, projectRef, accountId);
    await updateAction(actionId, "accepted", "RESTORING");
    await updateProjectStatus(
      accountId,
      projectRef,
      "RESTORING",
      "transitioning",
      "unknown",
    );
    return await getAction(actionId);
  } catch (error) {
    const code =
      error instanceof HarborError ? error.code : "RESTORE_REQUEST_FAILED";
    await updateAction(actionId, "failed", undefined, code, true);
    throw error;
  }
}

export async function reconcileAction(actionId: string, dek: Buffer) {
  const action = await getAction(actionId);
  if (action.status === "completed" || action.status === "failed")
    return action;
  const token = await revealAccountToken(action.accountId, dek);
  const project = await supabaseManagement.project(
    token,
    action.projectRef,
    action.accountId,
  );
  const normalized = normalizeProjectStatus(project.status);
  await updateProjectStatus(
    action.accountId,
    action.projectRef,
    project.status,
    normalized.lifecycleStatus,
    normalized.healthStatus,
  );
  if (normalized.lifecycleStatus === "active") {
    await updateAction(actionId, "completed", project.status, undefined, true);
  } else if (normalized.lifecycleStatus === "failed") {
    await updateAction(actionId, "failed", project.status, project.status, true);
  } else {
    await updateAction(actionId, "accepted", project.status);
  }
  return await getAction(actionId);
}
