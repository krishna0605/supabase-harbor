import { z } from "zod";
import { runKeepaliveNow } from "@/features/keepalive/enrollment-service";
import { requireHarborUser } from "@/server/auth/harbor-auth";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";

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
    return ok(await runKeepaliveNow(tenant, accountId, ref), { status: 202 });
  })(request);
}
