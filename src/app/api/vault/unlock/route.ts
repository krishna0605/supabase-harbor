import { z } from "zod";
import { HarborError } from "@/shared/errors/harbor-error";
import { unlockVault } from "@/server/crypto/vault-crypto";
import { getVaultRecord } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { appendCookies, readJson, route } from "@/server/http/route-helpers";
import {
  checkUnlockDelay,
  clearUnlockFailures,
  createSession,
  recordUnlockFailure,
  sessionCookies,
} from "@/server/session/session-store";

export const POST = route(async (request) => {
  checkUnlockDelay();
  const { password } = await readJson(
    request,
    z.object({ password: z.string().min(1) }),
  );
  const record = await getVaultRecord();
  if (!record) {
    throw new HarborError("VAULT_NOT_CONFIGURED", "Set up Harbor first.", 409);
  }
  try {
    const dek = await unlockVault(password, record);
    clearUnlockFailures();
    const session = createSession(dek);
    dek.fill(0);
    return appendCookies(ok({ state: "unlocked" }), sessionCookies(session));
  } catch (error) {
    recordUnlockFailure();
    throw error;
  }
});
