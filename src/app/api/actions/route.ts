import { listActivity } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireHarborUser } from "@/server/auth/harbor-auth";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const { context } = await requireHarborUser(request);
  return ok(await listActivity(context));
});
