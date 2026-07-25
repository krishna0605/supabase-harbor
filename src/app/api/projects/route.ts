import { cachedProjects } from "@/features/projects/project-service";
import { ok } from "@/server/http/responses";
import { route } from "@/server/http/route-helpers";
import { requireSession } from "@/server/session/session-store";

export const GET = route((request) => {
  requireSession(request);
  const projects = cachedProjects();
  return ok(projects, {
    stale: projects.some((project) =>
      Boolean((project as Record<string, unknown>).accountLastErrorCode),
    ),
  });
});
