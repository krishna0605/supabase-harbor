import type {
  ProjectHealthStatus,
  ProjectLifecycleStatus,
} from "@/shared/types/api";

const transitioning = new Set([
  "COMING_UP",
  "GOING_DOWN",
  "RESTORING",
  "UPGRADING",
  "PAUSING",
  "RESTARTING",
  "RESIZING",
]);

const failed = new Set(["INIT_FAILED", "RESTORE_FAILED", "PAUSE_FAILED"]);

export function normalizeProjectStatus(rawStatus: string): {
  lifecycleStatus: ProjectLifecycleStatus;
  healthStatus: ProjectHealthStatus;
} {
  if (rawStatus === "ACTIVE_HEALTHY") {
    return { lifecycleStatus: "active", healthStatus: "healthy" };
  }
  if (rawStatus === "ACTIVE_UNHEALTHY") {
    return { lifecycleStatus: "active", healthStatus: "unhealthy" };
  }
  if (rawStatus === "INACTIVE") {
    return { lifecycleStatus: "paused", healthStatus: "unknown" };
  }
  if (transitioning.has(rawStatus)) {
    return { lifecycleStatus: "transitioning", healthStatus: "unknown" };
  }
  if (failed.has(rawStatus)) {
    return { lifecycleStatus: "failed", healthStatus: "unknown" };
  }
  if (rawStatus === "REMOVED") {
    return { lifecycleStatus: "removed", healthStatus: "unknown" };
  }
  return { lifecycleStatus: "unknown", healthStatus: "unknown" };
}
