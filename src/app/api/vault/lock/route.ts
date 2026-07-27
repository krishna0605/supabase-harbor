import { ok } from "@/server/http/responses";
import { appendCookies, route } from "@/server/http/route-helpers";
import {
  clearedSessionCookies,
  clearAllSessions,
  requireSession,
} from "@/server/session/session-store";

export const POST = route(async (request) => {
  await requireSession(request, { csrf: true, touch: true });
  clearAllSessions();
  return appendCookies(ok({ state: "locked" }), clearedSessionCookies());
});
