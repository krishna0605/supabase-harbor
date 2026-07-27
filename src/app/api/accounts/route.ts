import { z } from "zod";
import { connectAccount } from "@/features/accounts/account-service";
import { listAccounts } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import {
  requireHarborUser,
  withUserDek,
} from "@/server/auth/harbor-auth";

export const GET = route(async (request) => {
  const { context } = await requireHarborUser(request);
  return ok(await listAccounts(context));
});

export const POST = route(async (request) => {
  const { context } = await requireHarborUser(request, { csrf: true });
  const input = await readJson(
    request,
    z.object({ label: z.string(), token: z.string() }),
  );
  return ok(
    await withUserDek(context, (dek) => connectAccount(context, input, dek)),
    { status: 201 },
  );
});
