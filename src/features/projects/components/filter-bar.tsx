"use client";

import { Rows3, Search, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

export function FilterBar({
  search,
  account,
  organization,
  accountOptions,
  organizationOptions,
  density,
  hasFilters,
  onChange,
  onClear,
  onToggleDensity,
}: {
  search: string;
  account: string;
  organization: string;
  accountOptions: string[];
  organizationOptions: string[];
  density: "comfortable" | "compact";
  hasFilters: boolean;
  onChange: (updates: Record<string, string | null>) => void;
  onClear: () => void;
  onToggleDensity: () => void;
}) {
  return (
    <section className="toolbar" aria-label="Project filters">
      <div className="search-wrap">
        <Search size={16} aria-hidden="true" />
        <input
          className="input"
          value={search}
          onChange={(event) => onChange({ q: event.target.value || null })}
          placeholder="Search name or reference"
          aria-label="Search projects"
          type="search"
        />
      </div>

      <select
        className="select"
        value={account}
        onChange={(event) => onChange({ account: event.target.value || null })}
        aria-label="Filter by account"
      >
        <option value="">All accounts</option>
        {accountOptions.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>

      <select
        className="select"
        value={organization}
        onChange={(event) => onChange({ org: event.target.value || null })}
        aria-label="Filter by organization"
      >
        <option value="">All organizations</option>
        {organizationOptions.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>

      {hasFilters ? (
        <button
          type="button"
          className="button button-quiet"
          onClick={onClear}
        >
          <X size={14} />
          Clear
        </button>
      ) : null}

      <span className="toolbar-spacer" />

      <Tooltip
        content={
          density === "compact" ? "Comfortable rows" : "Compact rows"
        }
      >
        <button
          type="button"
          className="button button-secondary"
          onClick={onToggleDensity}
          aria-pressed={density === "compact"}
          aria-label="Toggle row density"
        >
          <Rows3 size={15} />
        </button>
      </Tooltip>
    </section>
  );
}
