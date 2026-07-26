import { describe, expect, it } from "vitest";
import {
  PAUSE_WINDOW_DAYS,
  protectionOf,
  protectionSummary,
} from "@/features/keepalive/protection-state";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");
const DAY = 86_400_000;

const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("protectionOf", () => {
  it("is unprotected when keepalive is not enrolled", () => {
    const result = protectionOf(
      { enrolled: false, lastSuccessAt: null, paused: false },
      NOW,
    );
    expect(result.state).toBe("unprotected");
    expect(result.marginRatio).toBe(0);
    expect(result.tone).toBe("none");
  });

  it.each([
    [0, "protected"],
    [2, "protected"],
    [3, "slipping"],
    [5, "slipping"],
    [6, "at-risk"],
    [9, "at-risk"],
  ] as const)("grades a ping %d days old as %s", (days, expected) => {
    const result = protectionOf(
      { enrolled: true, lastSuccessAt: ago(days), paused: false },
      NOW,
    );
    expect(result.state).toBe(expected);
  });

  it("is at risk when paused, however recent the last ping", () => {
    const result = protectionOf(
      { enrolled: true, lastSuccessAt: ago(0), paused: true },
      NOW,
    );
    expect(result.state).toBe("at-risk");
  });

  it("is at risk when enrolled but never successfully pinged", () => {
    const result = protectionOf(
      { enrolled: true, lastSuccessAt: null, paused: false },
      NOW,
    );
    expect(result.state).toBe("at-risk");
  });

  it("drains margin one day at a time", () => {
    expect(
      protectionOf(
        { enrolled: true, lastSuccessAt: ago(0), paused: false },
        NOW,
      ).marginDays,
    ).toBe(PAUSE_WINDOW_DAYS);

    expect(
      protectionOf(
        { enrolled: true, lastSuccessAt: ago(4), paused: false },
        NOW,
      ).marginDays,
    ).toBe(3);
  });

  it("never reports negative margin once past the window", () => {
    const result = protectionOf(
      { enrolled: true, lastSuccessAt: ago(30), paused: false },
      NOW,
    );
    expect(result.marginDays).toBe(0);
    expect(result.marginRatio).toBe(0);
  });

  it("keeps marginRatio inside 0..1", () => {
    for (const days of [0, 1, 3, 6, 7, 20]) {
      const { marginRatio } = protectionOf(
        { enrolled: true, lastSuccessAt: ago(days), paused: false },
        NOW,
      );
      expect(marginRatio).toBeGreaterThanOrEqual(0);
      expect(marginRatio).toBeLessThanOrEqual(1);
    }
  });
});

describe("protectionSummary", () => {
  it("names enrollment as the next action when unprotected", () => {
    const protection = protectionOf(
      { enrolled: false, lastSuccessAt: null, paused: false },
      NOW,
    );
    expect(protectionSummary(protection, null)).toBe("not enrolled");
  });

  it("distinguishes enrolled-but-never-pinged from unenrolled", () => {
    const protection = protectionOf(
      { enrolled: true, lastSuccessAt: null, paused: false },
      NOW,
    );
    expect(protectionSummary(protection, null)).toBe("never pinged");
  });

  it("reports remaining margin once pinging", () => {
    const protection = protectionOf(
      { enrolled: true, lastSuccessAt: ago(2), paused: false },
      NOW,
    );
    expect(protectionSummary(protection, ago(2))).toBe("5d margin");
  });
});
