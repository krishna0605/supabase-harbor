import pino from "pino";
import fs from "node:fs";
import path from "node:path";
import { getLogDestination, isHostedRuntime, logsDir } from "@/server/config";

function loggerDestination() {
  if (getLogDestination() === "stdout") return undefined;
  fs.mkdirSync(logsDir, { recursive: true });
  return pino.destination({
    dest: path.join(logsDir, "harbor.log"),
    sync: false,
    mkdir: true,
  });
}

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
        "HARBOR_MASTER_KEY",
        "HARBOR_PREVIOUS_MASTER_KEY",
        "HARBOR_RATE_LIMIT_KEY",
        "NEON_AUTH_COOKIE_SECRET",
        "sessionToken",
        "accessToken",
        "refreshToken",
        "publishableKey",
        "credential",
        "credentialCiphertext",
        "credentialFingerprint",
        "leaseToken",
        "WORKER_DATABASE_URL",
        "tokenCiphertext",
        "wrappedDek",
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body",
      ],
      censor: "[REDACTED]",
    },
    base: {
      app: "supabase-harbor",
      runtime: isHostedRuntime() ? "hosted" : "local",
    },
  },
  loggerDestination(),
);
