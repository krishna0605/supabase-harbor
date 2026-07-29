import { z } from "zod";
import {
  enrollKeepalive,
  removeKeepalive,
  toggleKeepalive,
} from "@/features/keepalive/enrollment-service";
import { requireHarborUser, withUserDek } from "@/server/auth/harbor-auth";
import { ok } from "@/server/http/responses";
import { readJson, route } from "@/server/http/route-helpers";
import {
  enforceRateLimit,
  RATE_LIMITS,
  tenantRateLimitActor,
} from "@/server/security/rate-limit";

type Context = { params: Promise<{ ref: string }> };

const accountSchema = z.object({ accountId: z.string().uuid() });

export async function POST(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
    });
    const input = await readJson(
      currentRequest,
      accountSchema.extend({
        publishableKey: z.string().trim().max(4096).optional(),
      }),
    );
    const { ref } = await context.params;
    await enforceRateLimit(
      RATE_LIMITS.keepaliveEnrollment,
      tenantRateLimitActor(tenant, input.accountId, ref),
    );
    return ok(
      await withUserDek(tenant, (dek) =>
        enrollKeepalive(
          tenant,
          {
            accountId: input.accountId,
            projectRef: ref,
            publishableKey: input.publishableKey,
          },
          dek,
        ),
      ),
      { status: 201 },
    );
  })(request);
}

export async function PATCH(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
    });
    const input = await readJson(
      currentRequest,
      accountSchema.extend({ enabled: z.boolean() }),
    );
    const { ref } = await context.params;
    return ok(
      await toggleKeepalive(tenant, input.accountId, ref, input.enabled),
    );
  })(request);
}

export async function DELETE(request: Request, context: Context) {
  return route(async (currentRequest) => {
    const { context: tenant } = await requireHarborUser(currentRequest, {
      csrf: true,
    });
    const { accountId } = await readJson(currentRequest, accountSchema);
    const { ref } = await context.params;
    await removeKeepalive(tenant, accountId, ref);
    return ok({ removed: true });
  })(request);
}
