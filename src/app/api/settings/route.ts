import { z } from "zod";
import { getSettings, updateSettings } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireHarborUser } from "@/server/auth/harbor-auth";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const { context } = await requireHarborUser(request);
  return ok(await getSettings(context));
});

export const PATCH = route(async (request) => {
  const { context } = await requireHarborUser(request, { csrf: true });
  const input = await readJson(
    request,
    z.object({
      refreshIntervalMinutes: z.number().int().min(5).max(60).optional(),
      idleTimeoutMinutes: z.number().int().min(5).max(240).optional(),
    }),
  );
  return ok(
    await updateSettings(context, {
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
