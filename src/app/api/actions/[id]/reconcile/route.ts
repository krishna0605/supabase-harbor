import { reconcileAction } from "@/features/projects/project-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireHarborUser, withUserDek } from "@/server/auth/harbor-auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
    });
    const { id } = await context.params;
    return ok(
      await withUserDek(tenant, (dek) => reconcileAction(tenant, id, dek)),
    );
  })(request);
}
