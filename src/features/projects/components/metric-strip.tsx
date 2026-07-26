"use client";

import { CircleCheck, FolderKanban, Pause, ShieldOff, TriangleAlert } from "lucide-react";
import type { RiskFilter } from "@/features/projects/hooks/use-project-filters";

type Counts = {
  total: number;
  protected: number;
  atRisk: number;
  paused: number;
  unprotected: number;
};

/**
 * Risk-ordered, not inventory-ordered. The old strip led with Total and gave a
 * quarter of the first viewport to an Unhealthy count that was structurally
 * always zero. Each tile is also the filter for its own state.
 */
const TILES = [
  {
    key: "protected",
    label: "Protected",
    icon: CircleCheck,
    tone: "metric-protected",
  },
  { key: "at-risk", label: "At risk", icon: TriangleAlert, tone: "metric-risk" },
  { key: "paused", label: "Paused", icon: Pause, tone: "metric-paused" },
  {
    key: "unprotected",
    label: "Unprotected",
    icon: ShieldOff,
    tone: "",
  },
  { key: "all", label: "Total", icon: FolderKanban, tone: "" },
] as const;

export function MetricStrip({
  counts,
  active,
  onSelect,
}: {
  counts: Counts;
  active: RiskFilter;
  onSelect: (risk: RiskFilter) => void;
}) {
  const value: Record<string, number> = {
    protected: counts.protected,
    "at-risk": counts.atRisk,
    paused: counts.paused,
    unprotected: counts.unprotected,
    all: counts.total,
  };

  return (
    <section className="metrics" aria-label="Project risk summary">
      {TILES.map(({ key, label, icon: Icon, tone }) => (
        <button
          type="button"
          key={key}
          className={`metric ${tone}`}
          aria-pressed={active === key}
          onClick={() => onSelect(active === key ? "all" : (key as RiskFilter))}
        >
          <span className="metric-label">
            <Icon size={13} aria-hidden="true" />
            {label}
          </span>
          <strong className="metric-value">{value[key]}</strong>
        </button>
      ))}
    </section>
  );
}
