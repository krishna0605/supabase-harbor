"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Protection } from "@/features/keepalive/protection-state";

const TONE_ATTR = { ok: "ok", warn: "warn", crit: "crit", none: "none" } as const;

/**
 * Days of the seven-day window still in hand.
 *
 * The bar animates from full down to its true value so the eye reads depletion
 * rather than progress — the thing being shown is what's left, not what's been
 * achieved. Once per mount, never on refetch.
 */
export function MarginBar({ protection }: { protection: Protection }) {
  const reduced = useReducedMotion();

  if (protection.state === "unprotected") {
    return (
      <div className="margin-cell">
        <span className="margin-days" aria-hidden="true">
          —
        </span>
        <span className="visually-hidden">No keepalive margin: not enrolled</span>
      </div>
    );
  }

  const percent = Math.round(protection.marginRatio * 100);

  return (
    <div className="margin-cell">
      <div
        className="margin-bar"
        data-tone={TONE_ATTR[protection.tone]}
        role="meter"
        aria-valuenow={protection.marginDays}
        aria-valuemin={0}
        aria-valuemax={7}
        aria-label={`${protection.marginDays} of 7 days of keepalive margin remaining`}
      >
        <motion.span
          className="margin-bar-fill"
          initial={reduced ? false : { width: "100%" }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: [0.3, 0.8, 0.4, 1] }}
        />
      </div>
      <span className="margin-days" aria-hidden="true">
        {protection.marginDays}d
      </span>
    </div>
  );
}
