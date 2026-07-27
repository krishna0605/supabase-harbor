import { z } from "zod";
import { refreshProjectHealth } from "@/features/projects/project-service";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import {
  requireHarborUser,
  withUserDek,
} from "@/server/auth/harbor-auth";

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
    return ok(
      await withUserDek(tenant, (dek) =>
        refreshProjectHealth(tenant, accountId, ref, dek),
      ),
    );
  })(request);
}
