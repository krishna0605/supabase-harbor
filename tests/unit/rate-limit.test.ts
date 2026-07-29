import { afterEach, describe, expect, it } from "vitest";
import { getRateLimitKey } from "@/server/config";
import {
  RATE_LIMITS,
  requestRateLimitActor,
} from "@/server/security/rate-limit";

const originalRateLimitKey = process.env.HARBOR_RATE_LIMIT_KEY;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalRateLimitKey === undefined) {
    delete process.env.HARBOR_RATE_LIMIT_KEY;
  } else {
    process.env.HARBOR_RATE_LIMIT_KEY = originalRateLimitKey;
  }
  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }
});

describe("hosted rate limiting", () => {
  it("requires an independent 32-byte key in hosted environments", () => {
    process.env.VERCEL = "1";
    delete process.env.HARBOR_RATE_LIMIT_KEY;
    expect(() => getRateLimitKey()).toThrow("HARBOR_RATE_LIMIT_KEY is required");

    process.env.HARBOR_RATE_LIMIT_KEY = Buffer.alloc(32, 7).toString("base64");
    const key = getRateLimitKey();
    expect(key).toHaveLength(32);
    key.fill(0);
  });

  it("rejects malformed hosted rate-limit keys", () => {
    process.env.VERCEL = "1";
    process.env.HARBOR_RATE_LIMIT_KEY = "not-base64";
    expect(() => getRateLimitKey()).toThrow("base64-encoded 32-byte key");
  });

  it("uses the first trusted forwarded address as the actor", () => {
    process.env.VERCEL = "1";
    const request = new Request("https://harbor.example/api/auth/sign-in", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.5, 198.51.100.10",
      },
    });
    expect(requestRateLimitActor(request)).toBe("ip:203.0.113.5");
  });

  it("locks the production policy limits", () => {
    expect(RATE_LIMITS.auth).toMatchObject({
      limit: 20,
      windowSeconds: 600,
    });
    expect(RATE_LIMITS.restore.limit).toBe(3);
    expect(RATE_LIMITS.keepaliveRun.limit).toBe(6);
    expect(RATE_LIMITS.tenantDelete.windowSeconds).toBe(86400);
  });
});
