import { describe, expect, it } from "vitest";
import {
  absoluteTime,
  daysSince,
  relativeTime,
  stalenessTone,
} from "@/shared/time/relative";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

/** Build an ISO timestamp `ms` milliseconds before NOW. */
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it.each([
    [59 * SECOND, "just now"],
    [60 * SECOND, "1m ago"],
    [90 * MINUTE, "1h ago"],
    [23 * HOUR, "23h ago"],
    [25 * HOUR, "1d ago"],
    [6 * DAY, "6d ago"],
    [8 * DAY, "1w ago"],
    [21 * DAY, "3w ago"],
  ])("renders %dms as %s", (elapsed, expected) => {
    expect(relativeTime(ago(elapsed), NOW)).toBe(expected);
  });

  it("falls back to a date beyond five weeks, where 'w ago' stops helping", () => {
    expect(relativeTime(ago(60 * DAY), NOW)).toBe("2026-05-27");
  });

  it("handles a missing timestamp", () => {
    expect(relativeTime(null, NOW)).toBe("never");
  });

  it("handles an unparseable timestamp", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("unknown");
  });

  it("does not render negative elapsed time for clock skew", () => {
    expect(relativeTime(new Date(NOW + 5 * MINUTE).toISOString(), NOW)).toBe(
      "just now",
    );
  });
});

describe("stalenessTone", () => {
  it.each([
    [30 * MINUTE, "fresh"],
    [2 * HOUR, "ok"],
    [23 * HOUR, "ok"],
    [25 * HOUR, "warn"],
    [3 * DAY, "crit"],
    [10 * DAY, "crit"],
  ] as const)("grades %dms as %s", (elapsed, expected) => {
    expect(stalenessTone(ago(elapsed), NOW)).toBe(expected);
  });

  it("treats a never-synced value as critical", () => {
    expect(stalenessTone(null, NOW)).toBe("crit");
  });
});

describe("daysSince", () => {
  it("floors to whole days", () => {
    expect(daysSince(ago(47 * HOUR), NOW)).toBe(1);
    expect(daysSince(ago(49 * HOUR), NOW)).toBe(2);
  });

  it("returns Infinity when there is no timestamp, so margin reads as zero", () => {
    expect(daysSince(null, NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("absoluteTime", () => {
  it("gives a full ISO timestamp for the title attribute", () => {
    expect(absoluteTime(ago(0))).toBe("2026-07-26T12:00:00.000Z");
  });

  it("does not throw on bad input", () => {
    expect(absoluteTime("nonsense")).toBe("Unknown time");
    expect(absoluteTime(null)).toBe("No recorded time");
  });
});
