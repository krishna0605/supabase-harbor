import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/server/database/schema";
import { validateDatabaseUrl } from "@/server/config";

const globalForDatabase = globalThis as unknown as {
  harborDatabase?: NeonHttpDatabase<typeof schema>;
};

function connectionString() {
  const value =
    process.env.NODE_ENV === "test"
      ? process.env.TEST_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      process.env.NODE_ENV === "test"
        ? "TEST_DATABASE_URL is required."
        : "DATABASE_URL is required.",
    );
  }
  return validateDatabaseUrl(
    process.env.NODE_ENV === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL",
    value,
  );
}

export function getDatabase() {
  if (!globalForDatabase.harborDatabase) {
    globalForDatabase.harborDatabase = drizzle(neon(connectionString()), {
      schema,
    });
  }
  return globalForDatabase.harborDatabase;
}

export function resetDatabaseClient() {
  globalForDatabase.harborDatabase = undefined;
}

export async function checkDatabaseReadiness() {
  await getDatabase().execute(sql`select 1`);
}
