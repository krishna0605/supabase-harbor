import { getKeepaliveOverview } from "@/features/keepalive/enrollment-service";
import { requireHarborUser } from "@/server/auth/harbor-auth";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";

export const GET = route(async (request) => {
  const { context } = await requireHarborUser(request);
  return ok(await getKeepaliveOverview(context));
});
