import { refreshOneAccount } from "@/features/projects/refresh-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { dek } = requireSession(currentRequest, { csrf: true });
    const { id } = await context.params;
    return ok(await refreshOneAccount(id, dek));
  })(request);
}
