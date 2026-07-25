import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.HARBOR_DATA_DIR
      ? `${process.env.HARBOR_DATA_DIR}/harbor.db`
      : "./work/harbor.db",
  },
});
