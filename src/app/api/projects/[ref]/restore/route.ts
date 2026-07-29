import { z } from "zod";
import { restoreProject } from "@/features/projects/project-service";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireHarborUser, withUserDek } from "@/server/auth/harbor-auth";
import {
  enforceRateLimit,
  RATE_LIMITS,
  tenantRateLimitActor,
} from "@/server/security/rate-limit";

type Context = { params: Promise<{ ref: string }> };

export async function POST(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
    });
    const { accountId } = await readJson(
      currentRequest,
      z.object({ accountId: z.string().uuid() }),
    );
    const { ref } = await context.params;
    await enforceRateLimit(
      RATE_LIMITS.restore,
      tenantRateLimitActor(tenant, accountId, ref),
    );
    return ok(
      await withUserDek(tenant, (dek) =>
        restoreProject(tenant, accountId, ref, dek),
      ),
      { status: 202 },
    );
  })(request);
}
