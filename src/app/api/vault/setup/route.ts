import { z } from "zod";
import { HarborError } from "@/shared/errors/harbor-error";
import { createVault } from "@/server/crypto/vault-crypto";
import { insertVault, isVaultInitialized } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { appendCookies, readJson, route } from "@/server/http/route-helpers";
import { createSession, sessionCookies } from "@/server/session/session-store";

const schema = z
  .object({
    password: z.string().min(12),
    confirmation: z.string().min(12),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Passwords do not match.",
    path: ["confirmation"],
  });

export const POST = route(async (request) => {
  if (await isVaultInitialized()) {
    throw new HarborError(
      "VAULT_EXISTS",
      "The vault is already configured.",
      409,
    );
  }
  const input = await readJson(request, schema);
  const { dek, record } = await createVault(input.password);
  await insertVault(record);
  const session = createSession(dek);
  dek.fill(0);
  return appendCookies(
    ok({ state: "unlocked" }, { status: 201 }),
    sessionCookies(session),
  );
});
