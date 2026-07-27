import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const workerDatabaseUrl = process.env.WORKER_DATABASE_URL;
if (!workerDatabaseUrl) {
  throw new Error("WORKER_DATABASE_URL is required.");
}
process.env.DATABASE_URL = workerDatabaseUrl;

const { runKeepaliveSweep, workerOptions } = await import(
  "../src/worker/sweep"
);

const result = await runKeepaliveSweep(workerOptions());
console.log(
  JSON.stringify({
    event: "keepalive_sweep_complete",
    enqueued: result.enqueued,
    claimed: result.claimed,
    deleted: result.deleted,
  }),
);
