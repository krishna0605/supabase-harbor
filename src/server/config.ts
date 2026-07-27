import path from "node:path";
import os from "node:os";

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

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
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

export function getHostedAuthConfig() {
  const cookieSecret = required("NEON_AUTH_COOKIE_SECRET");
  if (cookieSecret.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters.");
  }

  const allowedGithubIds = new Set(
    required("HARBOR_ALLOWED_GITHUB_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  if (
    allowedGithubIds.size === 0 ||
    [...allowedGithubIds].some((id) => id === "*" || !/^\d+$/.test(id))
  ) {
    throw new Error(
      "HARBOR_ALLOWED_GITHUB_IDS must contain numeric GitHub IDs and cannot contain '*'.",
    );
  }

  return {
    authBaseUrl: parseAbsoluteUrl(
      "NEON_AUTH_BASE_URL",
      required("NEON_AUTH_BASE_URL"),
    ),
    cookieSecret,
    allowedGithubIds,
    origin: parseAbsoluteUrl("HARBOR_ORIGIN", canonicalOrigin),
  };
}
