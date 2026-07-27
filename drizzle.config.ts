import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
