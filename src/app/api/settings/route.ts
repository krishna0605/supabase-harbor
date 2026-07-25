import { z } from "zod";
import { getSettings, updateSettings } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

export const GET = route((request) => {
  requireSession(request);
  return ok(getSettings());
});

export const PATCH = route(async (request) => {
  requireSession(request, { csrf: true, touch: true });
  const input = await readJson(
    request,
    z.object({
      refreshIntervalMinutes: z.number().int().min(5).max(60).optional(),
      idleTimeoutMinutes: z.number().int().min(5).max(240).optional(),
    }),
  );
  return ok(
    updateSettings({
      ...(input.refreshIntervalMinutes
        ? {
            refresh_interval_minutes: String(input.refreshIntervalMinutes),
          }
        : {}),
      ...(input.idleTimeoutMinutes
        ? { idle_timeout_minutes: String(input.idleTimeoutMinutes) }
        : {}),
    }),
  );
});
