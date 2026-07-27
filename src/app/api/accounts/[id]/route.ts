import { z } from "zod";
import {
  patchAccount,
  removeAccount,
} from "@/features/accounts/account-service";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import {
  requireHarborUser,
  withUserDek,
} from "@/server/auth/harbor-auth";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
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
    return ok(
      await withUserDek(tenant, (dek) =>
        patchAccount(tenant, id, patch, dek),
      ),
    );
  })(request);
}

export async function DELETE(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
    });
    const { id } = await context.params;
    await removeAccount(tenant, id);
    return ok({ removed: true });
  })(request);
}
