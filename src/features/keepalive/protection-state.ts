/**
 * Protection state — Harbor's second state machine.
 *
 * A project has an upstream lifecycle owned by Supabase (active, paused,
 * transitioning) and, orthogonally, a protection state owned by Harbor. A
 * project can be ACTIVE and AT RISK at the same time, and that combination is
 * precisely the one worth surfacing. See DESIGN.md and docs/architecture.md.
 */

import { daysSince } from "@/shared/time/relative";

/** Supabase pauses a Free Plan project after 7 days of low database activity. */
export const PAUSE_WINDOW_DAYS = 7;

export type ProtectionState =
  | "protected"
  | "slipping"
  | "at-risk"
  | "unprotected";

export type ProtectionInput = {
  /** Whether keepalive is enrolled and enabled for this project. */
  enrolled: boolean;
  /** ISO timestamp of the last successful ping, if any. */
  lastSuccessAt: string | null;
  /** Whether Supabase currently reports the project as paused. */
  paused: boolean;
};

export type Protection = {
  state: ProtectionState;
  /** Whole days of the 7-day window still in hand. 0 when aground. */
  marginDays: number;
  /** 0–1, for the margin bar. Drains toward zero. */
  marginRatio: number;
  label: string;
  tone: "ok" | "warn" | "crit" | "none";
};

const LABEL: Record<ProtectionState, string> = {
  protected: "Protected",
  slipping: "Slipping",
  "at-risk": "At risk",
  unprotected: "Unprotected",
};

const TONE: Record<ProtectionState, Protection["tone"]> = {
  protected: "ok",
  slipping: "warn",
  "at-risk": "crit",
  unprotected: "none",
};

export function protectionOf(
  input: ProtectionInput,
  now = Date.now(),
): Protection {
  const state = classify(input, now);
  const elapsed = input.enrolled ? daysSince(input.lastSuccessAt, now) : 0;
  const marginDays =
    state === "unprotected"
      ? 0
      : Math.max(0, PAUSE_WINDOW_DAYS - Math.min(elapsed, PAUSE_WINDOW_DAYS));

  return {
    state,
    marginDays,
    marginRatio: state === "unprotected" ? 0 : marginDays / PAUSE_WINDOW_DAYS,
    label: LABEL[state],
    tone: TONE[state],
  };
}

function classify(input: ProtectionInput, now: number): ProtectionState {
  if (!input.enrolled) return "unprotected";
  // A paused project is at risk regardless of when we last reached it — the
  // keepalive demonstrably failed to do its job.
  if (input.paused) return "at-risk";
  if (!input.lastSuccessAt) return "at-risk";

  const elapsed = daysSince(input.lastSuccessAt, now);
  if (elapsed >= 6) return "at-risk";
  if (elapsed >= 3) return "slipping";
  return "protected";
}

/** Short sentence for the Last ping column. */
export function protectionSummary(
  protection: Protection,
  lastSuccessAt: string | null,
): string {
  if (protection.state === "unprotected") return "not enrolled";
  if (!lastSuccessAt) return "never pinged";
  return `${protection.marginDays}d margin`;
}
