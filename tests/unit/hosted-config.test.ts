import { afterEach, describe, expect, it } from "vitest";
import {
  getLogDestination,
  isHostedRuntime,
  validateDatabaseUrl,
} from "@/server/config";

describe("hosted runtime configuration", () => {
  afterEach(() => {
    delete process.env.HARBOR_LOG_DESTINATION;
  });

  it("detects Vercel, Railway, and explicit hosted runtimes", () => {
    expect(isHostedRuntime({ VERCEL: "1" })).toBe(true);
    expect(isHostedRuntime({ RAILWAY_ENVIRONMENT_ID: "environment-id" })).toBe(
      true,
    );
    expect(isHostedRuntime({ HARBOR_RUNTIME_MODE: "hosted" })).toBe(true);
    expect(isHostedRuntime({})).toBe(false);
  });

  it("uses file logs locally and stdout in hosted environments", () => {
    expect(getLogDestination({})).toBe("file");
    expect(getLogDestination({ VERCEL: "1" })).toBe("stdout");
    expect(
      getLogDestination({
        RAILWAY_ENVIRONMENT_ID: "environment-id",
        HARBOR_LOG_DESTINATION: "stdout",
      }),
    ).toBe("stdout");
  });

  it("rejects file logging and invalid destinations in hosted runtimes", () => {
    expect(() =>
      getLogDestination({
        VERCEL: "1",
        HARBOR_LOG_DESTINATION: "file",
      }),
    ).toThrow("must log to stdout");
    expect(() =>
      getLogDestination({ HARBOR_LOG_DESTINATION: "remote" }),
    ).toThrow("must be 'file' or 'stdout'");
  });

  it("requires PostgreSQL TLS for hosted connections", () => {
    expect(() =>
      validateDatabaseUrl(
        "DATABASE_URL",
        "postgresql://role:secret@db.host/neondb",
        { VERCEL: "1" },
      ),
    ).toThrow("must require TLS");
    expect(
      validateDatabaseUrl(
        "DATABASE_URL",
        "postgresql://role:secret@db.host/neondb?sslmode=require",
        { VERCEL: "1" },
      ),
    ).toContain("sslmode=require");
  });

  it("rejects non-PostgreSQL and placeholder hosted URLs", () => {
    expect(() =>
      validateDatabaseUrl("DATABASE_URL", "https://example.com", {}),
    ).toThrow("PostgreSQL protocol");
    expect(() =>
      validateDatabaseUrl(
        "DATABASE_URL",
        "postgresql://user:password@ep-example/neondb?sslmode=require",
        { HARBOR_RUNTIME_MODE: "hosted" },
      ),
    ).toThrow("placeholder");
  });
});
