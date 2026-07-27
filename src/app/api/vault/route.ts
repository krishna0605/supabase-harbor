import { z } from "zod";
import { HarborError } from "@/shared/errors/harbor-error";
import { resetVaultData } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { appendCookies, readJson, route } from "@/server/http/route-helpers";
import {
  clearedSessionCookies,
  clearAllSessions,
  requireSession,
} from "@/server/session/session-store";

export const DELETE = route(async (request) => {
  await requireSession(request, { csrf: true, touch: true });
  const { confirmation } = await readJson(
    request,
    z.object({ confirmation: z.string() }),
  );
  if (confirmation !== "RESET HARBOR") {
    throw new HarborError(
      "INVALID_CONFIRMATION",
      'Type "RESET HARBOR" to reset local data.',
      400,
    );
  }
  await resetVaultData();
  clearAllSessions();
  return appendCookies(ok({ reset: true }), clearedSessionCookies());
});
