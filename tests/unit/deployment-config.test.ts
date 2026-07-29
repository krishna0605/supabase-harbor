import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("deployment configuration", () => {
  it("keeps Vercel releases gated and on the Node.js build", () => {
    const config = JSON.parse(
      readFileSync(join(root, "vercel.json"), "utf8"),
    ) as {
      framework: string;
      installCommand: string;
      buildCommand: string;
      regions: string[];
      git: { deploymentEnabled: boolean };
    };

    expect(config.framework).toBe("nextjs");
    expect(config.installCommand).toBe("npm ci");
    expect(config.buildCommand).toBe("npm run build");
    expect(config.regions).toEqual(["iad1"]);
    expect(config.git.deploymentEnabled).toBe(false);
  });

  it("runs Railway as a short-lived, non-restarting cron worker", () => {
    const config = JSON.parse(
      readFileSync(join(root, "railway.worker.json"), "utf8"),
    ) as {
      deploy: {
        startCommand: string;
        cronSchedule: string;
        restartPolicyType: string;
        healthcheckPath?: string;
      };
    };

    expect(config.deploy.startCommand).toBe("npm run worker:sweep");
    expect(config.deploy.cronSchedule).toBe("*/15 * * * *");
    expect(config.deploy.restartPolicyType).toBe("NEVER");
    expect(config.deploy.healthcheckPath).toBeUndefined();
  });

  it("pins every API route to the Node.js runtime", () => {
    const routePaths = [
      "accounts/[id]/refresh/route.ts",
      "accounts/[id]/route.ts",
      "accounts/route.ts",
      "actions/[id]/reconcile/route.ts",
      "actions/route.ts",
      "auth/[...path]/route.ts",
      "healthz/route.ts",
      "keepalive/jobs/route.ts",
      "keepalive/route.ts",
      "me/route.ts",
      "projects/[ref]/health/route.ts",
      "projects/[ref]/keepalive/run/route.ts",
      "projects/[ref]/keepalive/route.ts",
      "projects/[ref]/restore/route.ts",
      "projects/route.ts",
      "refresh/route.ts",
      "settings/route.ts",
    ];

    for (const routePath of routePaths) {
      const source = readFileSync(
        join(root, "src", "app", "api", ...routePath.split("/")),
        "utf8",
      );
      expect(source, routePath).toContain('export const runtime = "nodejs"');
    }
  });
});
