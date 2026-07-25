import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { isVaultInitialized } from "@/server/database/repository";
import { vaultIsUnlocked } from "@/server/session/session-store";

export const GET = route(() =>
  ok({
    state: !isVaultInitialized()
      ? "uninitialized"
      : vaultIsUnlocked()
        ? "unlocked"
        : "locked",
  }),
);
