import { refreshAllAccounts } from "@/features/projects/refresh-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

export const POST = route(async (request) => {
  const { dek } = await requireSession(request, { csrf: true });
  return ok(await refreshAllAccounts(dek));
});
