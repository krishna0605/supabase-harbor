import { z } from "zod";
import { restoreProject } from "@/features/projects/project-service";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

type Context = { params: Promise<{ ref: string }> };

export async function POST(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { dek } = await requireSession(currentRequest, {
      csrf: true,
      touch: true,
    });
    const { accountId } = await readJson(
      currentRequest,
      z.object({ accountId: z.string().uuid() }),
    );
    const { ref } = await context.params;
    return ok(await restoreProject(accountId, ref, dek), { status: 202 });
  })(request);
}
