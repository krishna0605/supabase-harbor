import { spawnSync } from "node:child_process";

const verificationEnvironment = {
  ...process.env,
  HARBOR_ORIGIN: "http://127.0.0.1:47832",
  HARBOR_ALLOWED_EMAILS: "release@example.test",
  HARBOR_MASTER_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  HARBOR_MASTER_KEY_VERSION: "1",
  NEON_AUTH_BASE_URL: "https://auth.invalid/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "verification-only-cookie-secret-32-characters",
};

const checks = [
  ["run", "lint"],
  ["run", "typecheck"],
  ["run", "test"],
  ["run", "test:integration"],
  ["run", "build"],
  ["run", "test:e2e"],
  ["audit", "--omit=dev", "--audit-level=high"],
];

for (const args of checks) {
  const command =
    process.platform === "win32"
      ? {
          executable: process.env.ComSpec || "cmd.exe",
          arguments: ["/d", "/s", "/c", `npm ${args.join(" ")}`],
        }
      : { executable: "npm", arguments: args };
  const result = spawnSync(command.executable, command.arguments, {
    cwd: process.cwd(),
    env: verificationEnvironment,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
