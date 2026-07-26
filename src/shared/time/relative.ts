/**
 * Relative time for values that may be days old.
 *
 * The old dashboard rendered `HH:MM UTC`, which made "four minutes ago" and
 * "three days ago" look identical — the single most decision-relevant fact on
 * the screen was unreadable. Everything here is pure so the boundaries can be
 * tested directly.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export type StalenessTone = "fresh" | "ok" | "warn" | "crit";

/**
 * Compact relative string. Always pair with {@link absoluteTime} in a `title`
 * so the exact value stays one hover away.
 */
export function relativeTime(value: string | null, now = Date.now()): string {
  if (!value) return "never";

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "unknown";

  const elapsed = now - then;
  if (elapsed < 0) return "just now";
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

  const weeks = Math.floor(elapsed / WEEK);
  return weeks < 5 ? `${weeks}w ago` : new Date(then).toISOString().slice(0, 10);
}

/** Full ISO timestamp for the `title` attribute. */
export function absoluteTime(value: string | null): string {
  if (!value) return "No recorded time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toISOString();
}

/**
 * How alarmed to be about a timestamp's age. Thresholds are deliberately
 * generous: Harbor refreshes on load, so an hour-old cache is unremarkable.
 */
export function stalenessTone(
  value: string | null,
  now = Date.now(),
): StalenessTone {
  if (!value) return "crit";

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "crit";

  const elapsed = now - then;
  if (elapsed < HOUR) return "fresh";
  if (elapsed < DAY) return "ok";
  if (elapsed < 3 * DAY) return "warn";
  return "crit";
}

/** Whole days elapsed, floored. Used to compute keepalive margin. */
export function daysSince(value: string | null, now = Date.now()): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - then) / DAY));
}
