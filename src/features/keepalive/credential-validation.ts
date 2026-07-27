import { z } from "zod";
import { HarborError } from "@/shared/errors/harbor-error";
import type { SupabaseProjectApiKey } from "@/server/supabase/schemas";

export type KeepaliveCredentialType = "publishable" | "legacy_anon";

export type ValidatedKeepaliveCredential = {
  value: string;
  type: KeepaliveCredentialType;
  keyId: string | null;
};

const legacyPayloadSchema = z.object({ role: z.string() }).passthrough();

function legacyRole(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = legacyPayloadSchema.safeParse(
      JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
    );
    return payload.success ? payload.data.role : null;
  } catch {
    return null;
  }
}

export function validateKeepaliveCredential(
  input: string,
  keyId: string | null = null,
): ValidatedKeepaliveCredential {
  const value = input.trim();
  if (!value || value.length > 4096) {
    throw new HarborError(
      "KEEPALIVE_KEY_INVALID",
      "Enter a valid Supabase publishable key.",
      400,
    );
  }
  if (value.startsWith("sb_secret_")) {
    throw new HarborError(
      "KEEPALIVE_PRIVILEGED_KEY_REJECTED",
      "Harbor never accepts Supabase secret keys.",
      400,
    );
  }
  if (value.startsWith("sb_publishable_")) {
    return { value, type: "publishable", keyId };
  }
  const role = legacyRole(value);
  if (role === "service_role") {
    throw new HarborError(
      "KEEPALIVE_PRIVILEGED_KEY_REJECTED",
      "Harbor never accepts Supabase service-role keys.",
      400,
    );
  }
  if (role === "anon") {
    return { value, type: "legacy_anon", keyId };
  }
  throw new HarborError(
    "KEEPALIVE_KEY_INVALID",
    "Enter a Supabase publishable key or legacy anon key.",
    400,
  );
}

export function selectKeepaliveCredential(
  keys: SupabaseProjectApiKey[],
): ValidatedKeepaliveCredential {
  for (const key of keys) {
    if (key.type === "publishable" && key.api_key) {
      return validateKeepaliveCredential(key.api_key, key.id ?? null);
    }
  }
  for (const key of keys) {
    if (
      key.type === "legacy" &&
      key.secret_jwt_template?.role === "anon" &&
      key.api_key
    ) {
      return validateKeepaliveCredential(key.api_key, key.id ?? null);
    }
  }
  throw new HarborError(
    "KEEPALIVE_KEY_NOT_AVAILABLE",
    "No eligible Supabase publishable key is available for this project.",
    409,
  );
}
