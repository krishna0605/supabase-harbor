import { cachedProjects } from "@/features/projects/project-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireHarborUser } from "@/server/auth/harbor-auth";

export const GET = route(async (request) => {
  const { context } = await requireHarborUser(request);
  const projects = await cachedProjects(context);
  return ok(projects, {
    stale: projects.some((project) =>
      Boolean((project as Record<string, unknown>).accountLastErrorCode),
    ),
  });
});
