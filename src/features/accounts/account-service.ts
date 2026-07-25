import { HarborError } from "@/shared/errors/harbor-error";
import {
  decryptToken,
  encryptToken,
  fingerprintToken,
} from "@/server/crypto/vault-crypto";
import {
  deleteAccount,
  getAccountSecret,
  insertAccountWithCache,
  listAccounts,
  updateAccount,
} from "@/server/database/repository";
import { supabaseManagement } from "@/server/supabase/client";
import { normalizeProjectStatus } from "@/server/supabase/status";

function cleanLabel(label: string) {
  const value = label.trim();
  if (value.length < 2 || value.length > 60) {
    throw new HarborError(
      "INVALID_ACCOUNT_LABEL",
      "Account label must be between 2 and 60 characters.",
      400,
    );
  }
  return value;
}

export async function connectAccount(
  input: { label: string; token: string },
  dek: Buffer,
) {
  const label = cleanLabel(input.label);
  const token = input.token.trim();
  if (!token.startsWith("sbp_") && token.length < 24) {
    throw new HarborError(
      "INVALID_ACCESS_TOKEN",
      "Enter a valid Supabase Personal Access Token.",
      400,
    );
  }
  const [profile, organizations, projects] = await Promise.all([
    supabaseManagement.profile(token),
    supabaseManagement.organizations(token),
    supabaseManagement.projects(token),
  ]);
  const orgMap = new Map(organizations.map((org) => [org.id, org]));
  const projectCache = projects.map((project) => {
    const normalized = normalizeProjectStatus(project.status);
    const org = project.organization_id
      ? orgMap.get(project.organization_id)
      : undefined;
    return {
      ref: project.ref,
      organizationId: project.organization_id ?? org?.id ?? "unknown",
      organizationSlug:
        project.organization_slug ?? org?.slug ?? project.organization_id ?? "",
      name: project.name,
      region: project.region,
      cloudProvider: project.cloud_provider ?? "unknown",
      rawStatus: project.status,
      ...normalized,
      createdAt: project.created_at ?? new Date().toISOString(),
    };
  });
  const accountId = insertAccountWithCache({
    label,
    userId: profile.id,
    primaryEmail:
      profile.primary_email ??
      profile.email ??
      profile.username ??
      "Unknown account",
    encryptedToken: encryptToken(token, dek),
    fingerprint: fingerprintToken(token, dek),
    organizations: organizations.map((org) => ({
      id: org.id,
      slug: org.slug ?? org.id,
      name: org.name,
      plan: org.plan ?? "unknown",
    })),
    projects: projectCache,
  });
  return listAccounts().find((account) => account.id === accountId);
}

export async function patchAccount(
  accountId: string,
  patch: { label?: string; enabled?: boolean; token?: string },
  dek: Buffer,
) {
  if (patch.token) {
    const token = patch.token.trim();
    await supabaseManagement.profile(token);
    updateAccount(accountId, {
      label: patch.label ? cleanLabel(patch.label) : undefined,
      enabled: patch.enabled,
      token: encryptToken(token, dek),
      fingerprint: fingerprintToken(token, dek),
    });
  } else {
    updateAccount(accountId, {
      label: patch.label ? cleanLabel(patch.label) : undefined,
      enabled: patch.enabled,
    });
  }
  return listAccounts().find((account) => account.id === accountId);
}

export function revealAccountToken(accountId: string, dek: Buffer) {
  const account = getAccountSecret(accountId);
  if (!account.enabled) {
    throw new HarborError(
      "ACCOUNT_DISABLED",
      "Enable this account before using it.",
      409,
    );
  }
  return decryptToken(account.token, dek);
}

export function removeAccount(accountId: string) {
  getAccountSecret(accountId);
  deleteAccount(accountId);
}
