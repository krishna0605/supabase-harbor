import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { getDatabase } from "@/server/database/client";

export const runtime = "nodejs";

export const GET = route(() => {
  getDatabase().sqlite.prepare("SELECT 1").get();
  return ok({ ready: true, service: "supabase-harbor" });
});
