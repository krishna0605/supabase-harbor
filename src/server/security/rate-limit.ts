import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getRateLimitKey } from "@/server/config";
import { getDatabase } from "@/server/database/client";
import { HarborError } from "@/shared/errors/harbor-error";
import type { TenantContext } from "@/shared/types/auth";

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  auth: { scope: "auth", limit: 20, windowSeconds: 600 },
  accountWrite: {
    scope: "account-write",
    limit: 10,
    windowSeconds: 3600,
  },
  refresh: { scope: "refresh", limit: 12, windowSeconds: 300 },
  restore: { scope: "restore", limit: 3, windowSeconds: 3600 },
  keepaliveEnrollment: {
    scope: "keepalive-enrollment",
    limit: 10,
    windowSeconds: 3600,
  },
  keepaliveRun: {
    scope: "keepalive-run",
    limit: 6,
    windowSeconds: 3600,
  },
  tenantDelete: {
    scope: "tenant-delete",
    limit: 3,
    windowSeconds: 86400,
  },
} as const satisfies Record<string, RateLimitPolicy>;

function digestActor(actor: string) {
  const key = getRateLimitKey();
  try {
    return createHmac("sha256", key).update(actor).digest("hex");
  } finally {
    key.fill(0);
  }
}

function forwardedClient(request: Request) {
  const header =
    (process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")
      : null) ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return header.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

export function requestRateLimitActor(request: Request) {
  return `ip:${forwardedClient(request)}`;
}

export function tenantRateLimitActor(
  context: TenantContext,
  ...resourceParts: string[]
) {
  return ["user", context.userId, ...resourceParts].join(":");
}

export async function enforceRateLimit(
  policy: RateLimitPolicy,
  actor: string,
) {
  const actorDigest = digestActor(actor);
  const [, result] = await getDatabase().batch([
    getDatabase().execute(sql.raw("set local role harbor_runtime")),
    getDatabase().execute<{
      allowed: boolean;
      remaining: number;
      retryAfterSeconds: number;
    }>(
      sql`select allowed, remaining,
        retry_after_seconds as "retryAfterSeconds"
      from harbor_security.consume_rate_limit(
        ${policy.scope}, ${actorDigest}, ${policy.windowSeconds}, ${policy.limit}
      )`,
    ),
  ]);
  const decision = result.rows[0];
  if (!decision?.allowed) {
    throw new HarborError(
      "RATE_LIMITED",
      "Too many requests. Try again later.",
      429,
      true,
      undefined,
      Math.max(1, Number(decision?.retryAfterSeconds ?? 1)) * 1000,
    );
  }
  return {
    remaining: Number(decision.remaining),
    retryAfterSeconds: Number(decision.retryAfterSeconds),
  };
}
