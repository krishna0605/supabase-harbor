import { z } from "zod";
import { connectAccount } from "@/features/accounts/account-service";
import { listAccounts } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

export const GET = route((request) => {
  requireSession(request);
  return ok(listAccounts());
});

export const POST = route(async (request) => {
  const { dek } = requireSession(request, { csrf: true, touch: true });
  const input = await readJson(
    request,
    z.object({ label: z.string(), token: z.string() }),
  );
  return ok(await connectAccount(input, dek), { status: 201 });
});
