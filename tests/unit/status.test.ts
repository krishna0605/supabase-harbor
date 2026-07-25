import { describe, expect, it } from "vitest";
import { normalizeProjectStatus } from "@/server/supabase/status";

describe("normalizeProjectStatus", () => {
  it.each([
    ["ACTIVE_HEALTHY", "active", "healthy"],
    ["ACTIVE_UNHEALTHY", "active", "unhealthy"],
    ["INACTIVE", "paused", "unknown"],
    ["COMING_UP", "transitioning", "unknown"],
    ["GOING_DOWN", "transitioning", "unknown"],
    ["RESTORING", "transitioning", "unknown"],
    ["UPGRADING", "transitioning", "unknown"],
    ["PAUSING", "transitioning", "unknown"],
    ["RESTARTING", "transitioning", "unknown"],
    ["RESIZING", "transitioning", "unknown"],
    ["INIT_FAILED", "failed", "unknown"],
    ["RESTORE_FAILED", "failed", "unknown"],
    ["PAUSE_FAILED", "failed", "unknown"],
    ["REMOVED", "removed", "unknown"],
  ] as const)("maps %s", (raw, lifecycleStatus, healthStatus) => {
    expect(normalizeProjectStatus(raw)).toEqual({
      lifecycleStatus,
      healthStatus,
    });
  });

  it("keeps future statuses safe", () => {
    expect(normalizeProjectStatus("FUTURE_SUPABASE_STATE")).toEqual({
      lifecycleStatus: "unknown",
      healthStatus: "unknown",
    });
  });
});
