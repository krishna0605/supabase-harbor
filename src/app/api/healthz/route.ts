import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { checkDatabaseReadiness } from "@/server/database/client";

export const runtime = "nodejs";

export const GET = route(async () => {
  await checkDatabaseReadiness();
  return ok({ ready: true, service: "supabase-harbor" });
});
