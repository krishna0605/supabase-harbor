import pino from "pino";
import fs from "node:fs";
import path from "node:path";
import { logsDir } from "@/server/config";

fs.mkdirSync(logsDir, { recursive: true });

const destination = pino.destination({
  dest: path.join(logsDir, "harbor.log"),
  sync: false,
  mkdir: true,
});

export const logger = pino(
  {
    level: process.env.HARBOR_LOG_LEVEL || "info",
    redact: {
      paths: [
        "authorization",
        "headers.authorization",
        "headers.cookie",
        "cookie",
        "token",
        "pat",
        "password",
        "masterPassword",
        "newPassword",
        "databaseUrl",
        "connectionString",
        "DATABASE_URL",
        "DATABASE_URL_UNPOOLED",
        "TEST_DATABASE_URL",
        "TEST_DATABASE_URL_UNPOOLED",
        "tokenCiphertext",
        "wrappedDek",
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body",
      ],
      censor: "[REDACTED]",
    },
    base: { app: "supabase-harbor" },
  },
  destination,
);
