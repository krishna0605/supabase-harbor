import { refreshAllAccounts } from "@/features/projects/refresh-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireHarborUser, withUserDek } from "@/server/auth/harbor-auth";
import {
  enforceRateLimit,
  RATE_LIMITS,
  tenantRateLimitActor,
} from "@/server/security/rate-limit";

export const POST = route(async (request) => {
  const { context } = await requireHarborUser(request, { csrf: true });
  await enforceRateLimit(RATE_LIMITS.refresh, tenantRateLimitActor(context));
  return ok(
    await withUserDek(context, (dek) => refreshAllAccounts(context, dek)),
  );
});
