import { z } from "zod";
import {
  clearCsrfCookie,
  createCsrfCookie,
  requireHarborUser,
} from "@/server/auth/harbor-auth";
import { deleteTenantData } from "@/server/database/repository";
import { ok } from "@/server/http/responses";
import { appendCookies, readJson, route } from "@/server/http/route-helpers";
import { HarborError } from "@/shared/errors/harbor-error";

export const GET = route(async (request) => {
  const { identity, sessionId } = await requireHarborUser(request);
  const response = ok({
    name: identity.name,
    email: identity.email,
    image: identity.image,
  });
  return appendCookies(response, [createCsrfCookie(sessionId)]);
});

export const DELETE = route(async (request) => {
  const { context } = await requireHarborUser(request, { csrf: true });
  const { confirmation } = await readJson(
    request,
    z.object({ confirmation: z.string() }),
  );
  if (confirmation !== "DELETE MY HARBOR DATA") {
    throw new HarborError(
      "INVALID_CONFIRMATION",
      'Type "DELETE MY HARBOR DATA" to remove your Harbor data.',
      400,
    );
  }
  await deleteTenantData(context);
  return appendCookies(ok({ deleted: true }), [clearCsrfCookie()]);
});
