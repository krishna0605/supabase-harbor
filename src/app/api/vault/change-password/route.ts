import { z } from "zod";
import { rewrapDek } from "@/server/crypto/vault-crypto";
import { updateVault } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

const schema = z
  .object({
    newPassword: z.string().min(12),
    confirmation: z.string().min(12),
  })
  .refine((value) => value.newPassword === value.confirmation, {
    message: "Passwords do not match.",
    path: ["confirmation"],
  });

export const POST = route(async (request) => {
  const { dek } = await requireSession(request, { csrf: true, touch: true });
  const { newPassword } = await readJson(request, schema);
  await updateVault(await rewrapDek(dek, newPassword));
  return ok({ changed: true });
});
