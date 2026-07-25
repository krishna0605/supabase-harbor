import { listActivity } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

export const GET = route((request) => {
  requireSession(request);
  return ok(listActivity());
});
