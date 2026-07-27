import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  const workerDatabaseUrl = process.env.WORKER_DATABASE_URL;
  if (!workerDatabaseUrl) {
    throw new Error("WORKER_DATABASE_URL is required.");
  }
  process.env.DATABASE_URL = workerDatabaseUrl;

  const { runKeepaliveSweep, workerOptions } =
    await import("../src/worker/sweep");
  let shutdownRequested = false;
  process.once("SIGTERM", () => {
    shutdownRequested = true;
  });
  process.once("SIGINT", () => {
    shutdownRequested = true;
  });

  const result = await runKeepaliveSweep(
    workerOptions(),
    () => shutdownRequested,
  );
  console.log(
    JSON.stringify({
      event: "keepalive_sweep_complete",
      enqueued: result.enqueued,
      claimed: result.claimed,
      deleted: result.deleted,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "keepalive_sweep_failed",
      errorCode: "KEEPALIVE_SWEEP_FAILED",
    }),
  );
  if (error instanceof Error) error.message = "Keepalive sweep failed.";
  process.exitCode = 1;
});
