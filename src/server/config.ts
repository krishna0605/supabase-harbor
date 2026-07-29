import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

export const harborPort = Number(process.env.HARBOR_PORT || "47832");

const localAppData = process.env.LOCALAPPDATA || os.tmpdir();
export const logsDir = path.join(
  localAppData,
  process.env.NODE_ENV === "development"
    ? "SupabaseHarbor-dev"
    : "SupabaseHarbor",
  "logs",
);
export const canonicalOrigin =
  process.env.HARBOR_ORIGIN || `http://127.0.0.1:${harborPort}`;

const PLACEHOLDER_PATTERN =
  /(?:replace-with|example|password@|auth\.invalid|^A{32,}={0,2}$)/i;

export function isHostedRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.VERCEL === "1" ||
    Boolean(environment.RAILWAY_ENVIRONMENT_ID) ||
    environment.HARBOR_RUNTIME_MODE === "hosted"
  );
}

export function getLogDestination(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configured = environment.HARBOR_LOG_DESTINATION?.trim().toLowerCase();
  if (configured && configured !== "file" && configured !== "stdout") {
    throw new Error("HARBOR_LOG_DESTINATION must be 'file' or 'stdout'.");
  }
  if (isHostedRuntime(environment) && configured === "file") {
    throw new Error("Hosted Harbor runtimes must log to stdout.");
  }
  return configured ?? (isHostedRuntime(environment) ? "stdout" : "file");
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  if (isHostedRuntime() && PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${name} contains a placeholder value.`);
  }
  return value;
}

function parseAbsoluteUrl(name: string, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost"
  ) {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  return url.toString().replace(/\/$/, "");
}

export function validateDatabaseUrl(
  name: string,
  value: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (isHostedRuntime(environment) && PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${name} contains a placeholder value.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL connection URL.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${name} must use the PostgreSQL protocol.`);
  }
  if (
    isHostedRuntime(environment) &&
    url.searchParams.get("sslmode") !== "require"
  ) {
    throw new Error(`${name} must require TLS in hosted environments.`);
  }
  return value;
}

export function getHostedAuthConfig() {
  const cookieSecret = required("NEON_AUTH_COOKIE_SECRET");
  if (cookieSecret.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters.");
  }

  const allowedEmails = new Set(
    required("HARBOR_ALLOWED_EMAILS")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (
    allowedEmails.size === 0 ||
    [...allowedEmails].some(
      (email) =>
        email === "*" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    )
  ) {
    throw new Error(
      "HARBOR_ALLOWED_EMAILS must contain valid email addresses and cannot contain '*'.",
    );
  }

  return {
    authBaseUrl: parseAbsoluteUrl(
      "NEON_AUTH_BASE_URL",
      required("NEON_AUTH_BASE_URL"),
    ),
    cookieSecret,
    allowedEmails,
    origin: parseAbsoluteUrl("HARBOR_ORIGIN", canonicalOrigin),
  };
}

export function getRateLimitKey() {
  const configured = process.env.HARBOR_RATE_LIMIT_KEY?.trim();
  if (!configured) {
    if (isHostedRuntime()) {
      throw new Error("HARBOR_RATE_LIMIT_KEY is required.");
    }
    return createHash("sha256")
      .update(required("NEON_AUTH_COOKIE_SECRET"))
      .update("\0supabase-harbor:local-rate-limit")
      .digest();
  }
  if (isHostedRuntime() && PLACEHOLDER_PATTERN.test(configured)) {
    throw new Error("HARBOR_RATE_LIMIT_KEY contains a placeholder value.");
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(configured)) {
    throw new Error(
      "HARBOR_RATE_LIMIT_KEY must be a base64-encoded 32-byte key.",
    );
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error(
      "HARBOR_RATE_LIMIT_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}
