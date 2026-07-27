import { z } from "zod";
import {
  patchAccount,
  removeAccount,
} from "@/features/accounts/account-service";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { dek } = await requireSession(currentRequest, {
      csrf: true,
      touch: true,
    });
    const { id } = await context.params;
    const patch = await readJson(
      currentRequest,
      z.object({
        label: z.string().optional(),
        enabled: z.boolean().optional(),
        token: z.string().optional(),
      }),
    );
    return ok(await patchAccount(id, patch, dek));
  })(request);
}

export async function DELETE(request: Request, context: Context) {
  return route(async (currentRequest) => {
    await requireSession(currentRequest, { csrf: true, touch: true });
    const { id } = await context.params;
    await removeAccount(id);
    return ok({ removed: true });
  })(request);
}
