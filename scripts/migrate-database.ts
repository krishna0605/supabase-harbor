import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadEnvConfig(process.cwd());

const connectionString =
  process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_URL_UNPOOLED
    : process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    process.env.NODE_ENV === "test"
      ? "TEST_DATABASE_URL_UNPOOLED is required."
      : "DATABASE_URL_UNPOOLED is required.",
  );
}

async function main() {
  const database = drizzle(neon(connectionString!));
  await migrate(database, { migrationsFolder: "./drizzle" });
  console.log("Supabase Harbor database migrations are complete.");
}

void main();
