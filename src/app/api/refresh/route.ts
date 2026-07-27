import { refreshAllAccounts } from "@/features/projects/refresh-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import {
  requireHarborUser,
  withUserDek,
} from "@/server/auth/harbor-auth";

export const POST = route(async (request) => {
  const { context } = await requireHarborUser(request, { csrf: true });
  return ok(
    await withUserDek(context, (dek) =>
      refreshAllAccounts(context, dek),
    ),
  );
});
