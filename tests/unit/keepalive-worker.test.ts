import { describe, expect, it } from "vitest";
import { runKeepaliveSweep, workerOptions } from "@/worker/sweep";

describe("keepalive worker configuration", () => {
  it("uses bounded production defaults", () => {
    expect(workerOptions({})).toMatchObject({
      claimLimit: 25,
      concurrency: 5,
      deadlineMs: 240_000,
    });
  });

  it("rejects unsafe concurrency and deadlines", () => {
    expect(() => workerOptions({ KEEPALIVE_MAX_CONCURRENCY: "0" })).toThrow(
      "integer from 1 to 20",
    );
    expect(() =>
      workerOptions({ KEEPALIVE_SWEEP_TIMEOUT_MS: "999999" }),
    ).toThrow("integer from 30000 to 240000");
  });

  it("does not claim work after shutdown is requested", async () => {
    await expect(
      runKeepaliveSweep(
        {
          workerId: "shutdown-test",
          claimLimit: 25,
          concurrency: 5,
          deadlineMs: 240_000,
        },
        () => true,
      ),
    ).resolves.toEqual({ enqueued: 0, claimed: 0, deleted: 0 });
  });
});
