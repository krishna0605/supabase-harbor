import { auth } from "@/server/auth/neon-auth";
import { route } from "@/server/http/route-helpers";
import {
  enforceRateLimit,
  RATE_LIMITS,
  requestRateLimitActor,
} from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = auth.handler();

export const GET = handlers.GET;

function protectedAuthHandler<Arguments extends unknown[]>(
  handler: (
    request: Request,
    ...arguments_: Arguments
  ) => Promise<Response> | Response,
) {
  return route(async (request, ...arguments_: Arguments) => {
    await enforceRateLimit(RATE_LIMITS.auth, requestRateLimitActor(request));
    return handler(request, ...arguments_);
  });
}

export const POST = protectedAuthHandler(handlers.POST);
export const PUT = protectedAuthHandler(handlers.PUT);
export const DELETE = protectedAuthHandler(handlers.DELETE);
export const PATCH = protectedAuthHandler(handlers.PATCH);
