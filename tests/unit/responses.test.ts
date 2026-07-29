import { describe, expect, it } from "vitest";
import { failure } from "@/server/http/responses";
import { HarborError } from "@/shared/errors/harbor-error";

describe("API error responses", () => {
  it("returns Retry-After for durable rate-limit errors", async () => {
    const response = failure(
      new HarborError(
        "RATE_LIMITED",
        "Too many requests. Try again later.",
        429,
        true,
        undefined,
        12_250,
      ),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("13");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "RATE_LIMITED",
        retryable: true,
      },
    });
  });
});
