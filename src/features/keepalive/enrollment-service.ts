import { createHash } from "node:crypto";
import {
  selectKeepaliveCredential,
  validateKeepaliveCredential,
} from "@/features/keepalive/credential-validation";
import { isKnownPaidPlan } from "@/features/keepalive/plan-eligibility";
import { revealAccountToken } from "@/features/accounts/account-service";
import {
  encryptKeepaliveCredential,
  fingerprintKeepaliveCredential,
} from "@/server/crypto/hosted-crypto";
import {
  deleteKeepaliveEnrollment,
  getKeepaliveEnrollment,
  getProject,
  listKeepaliveEnrollments,
  listKeepaliveAttempts,
  listKeepaliveJobs,
  listProjects,
  queueKeepaliveJob,
  setKeepaliveEnabled,
  upsertKeepaliveEnrollment,
} from "@/server/database/repository";
import { pingProject } from "@/server/keepalive/heartbeat-client";
import { supabaseManagement } from "@/server/supabase/client";
import { HarborError } from "@/shared/errors/harbor-error";
import type { TenantContext } from "@/shared/types/auth";

function nextDailyRun(projectRef: string, from = Date.now()) {
  const digest = createHash("sha256").update(projectRef).digest();
  const jitterMs = digest.readUInt32BE(0) % (2 * 60 * 60 * 1000 + 1);
  return new Date(from + 24 * 60 * 60 * 1000 + jitterMs).toISOString();
}

export async function enrollKeepalive(
  context: TenantContext,
  input: {
    accountId: string;
    projectRef: string;
    publishableKey?: string;
  },
  dek: Buffer,
) {
  const project = await getProject(context, input.accountId, input.projectRef);
  const dashboardProject = (await listProjects(context)).find(
    (candidate) =>
      candidate.accountId === input.accountId &&
      candidate.projectRef === input.projectRef,
  );
  if (isKnownPaidPlan(dashboardProject?.organizationPlan)) {
    throw new HarborError(
      "KEEPALIVE_PAID_PLAN_NOT_APPLICABLE",
      "Automatic project pausing does not apply to this paid organization.",
      409,
    );
  }
  if (project.lifecycleStatus !== "active") {
    throw new HarborError(
      "KEEPALIVE_PROJECT_NOT_ACTIVE",
      "Restore this project before enabling heartbeat activity.",
      409,
    );
  }

  let source: "automatic" | "manual";
  let credential;
  if (input.publishableKey?.trim()) {
    source = "manual";
    credential = validateKeepaliveCredential(input.publishableKey);
  } else {
    source = "automatic";
    const token = await revealAccountToken(context, input.accountId, dek);
    try {
      credential = selectKeepaliveCredential(
        await supabaseManagement.projectApiKeys(
          token,
          input.projectRef,
          input.accountId,
        ),
      );
    } catch (error) {
      if (
        error instanceof HarborError &&
        (error.code === "SUPABASE_FORBIDDEN" ||
          error.code === "KEEPALIVE_KEY_NOT_AVAILABLE")
      ) {
        throw new HarborError(
          "KEEPALIVE_KEY_PERMISSION_REQUIRED",
          "This token cannot discover a publishable key. Enter the project's publishable key manually.",
          409,
          false,
          { accountId: input.accountId, projectRef: input.projectRef },
        );
      }
      throw error;
    }
  }

  const startedAt = Date.now();
  const heartbeat = await pingProject(input.projectRef, credential.value);
  const verifiedAt = heartbeat.pingedAt;
  const encrypted = encryptKeepaliveCredential(
    credential.value,
    context.userId,
    input.accountId,
    input.projectRef,
    dek,
  );
  try {
    await upsertKeepaliveEnrollment({
      context,
      accountId: input.accountId,
      projectRef: input.projectRef,
      credential: encrypted,
      credentialFingerprint: fingerprintKeepaliveCredential(
        credential.value,
        context.userId,
        input.accountId,
        input.projectRef,
        dek,
      ),
      credentialType: credential.type,
      credentialSource: source,
      credentialKeyId: credential.keyId,
      verifiedAt,
      nextRunAt: nextDailyRun(input.projectRef, Date.parse(verifiedAt)),
      validation: {
        durationMs: Math.max(0, Date.now() - startedAt),
        upstreamStatus: heartbeat.upstreamStatus,
      },
    });
  } finally {
    encrypted.ciphertext.fill(0);
    encrypted.nonce.fill(0);
    encrypted.tag.fill(0);
  }
  return getKeepaliveEnrollment(context, input.accountId, input.projectRef);
}

export async function getKeepaliveOverview(context: TenantContext) {
  const [enrollments, jobs, attempts] = await Promise.all([
    listKeepaliveEnrollments(context),
    listKeepaliveJobs(context, 30),
    listKeepaliveAttempts(context, 30),
  ]);
  return { enrollments, jobs, attempts };
}

export async function getKeepaliveHistory(context: TenantContext) {
  const [jobs, attempts] = await Promise.all([
    listKeepaliveJobs(context, 100),
    listKeepaliveAttempts(context, 100),
  ]);
  return { jobs, attempts };
}

export async function toggleKeepalive(
  context: TenantContext,
  accountId: string,
  projectRef: string,
  enabled: boolean,
) {
  await getProject(context, accountId, projectRef);
  await setKeepaliveEnabled(context, accountId, projectRef, enabled);
  return getKeepaliveEnrollment(context, accountId, projectRef);
}

export async function removeKeepalive(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  await getProject(context, accountId, projectRef);
  await deleteKeepaliveEnrollment(context, accountId, projectRef);
}

export async function runKeepaliveNow(
  context: TenantContext,
  accountId: string,
  projectRef: string,
) {
  await getProject(context, accountId, projectRef);
  return { jobId: await queueKeepaliveJob(context, accountId, projectRef) };
}
