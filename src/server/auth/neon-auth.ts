import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getHostedAuthConfig } from "@/server/config";
import { logger } from "@/server/logging/logger";

const config = getHostedAuthConfig();

export const auth = createNeonAuth({
  baseUrl: config.authBaseUrl,
  cookies: {
    secret: config.cookieSecret,
    sessionDataTtl: 60,
    sameSite: "lax",
  },
  logger: {
    error: (message, meta) => logger.error(meta, message),
    warn: (message, meta) => logger.warn(meta, message),
    info: (message, meta) => logger.info(meta, message),
    debug: (message, meta) => logger.debug(meta, message),
  },
  logLevel: process.env.HARBOR_LOG_LEVEL === "debug" ? "debug" : "warn",
});
