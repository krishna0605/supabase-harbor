"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectRow } from "@/features/projects/components/project-row";
import type { SortKey } from "@/features/projects/hooks/use-project-filters";
import type { Protection } from "@/features/keepalive/protection-state";
import type { DashboardProject } from "@/features/projects/project-types";

export type DecoratedProject = {
  project: DashboardProject;
  protection: Protection;
};

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: "name", label: "Project" },
  { key: "account", label: "Account" },
  { key: "status", label: "Status" },
  { key: "protection", label: "Protection" },
  { key: "margin", label: "Margin" },
  { key: "ping", label: "Last ping" },
];

const rowKey = (row: DecoratedProject) =>
  `${row.project.accountId}:${row.project.projectRef}`;

export function ProjectTable({
  rows,
  selection,
  expanded,
  sort,
  direction,
  sweeping,
  density,
  disabled,
  onToggleSort,
  onToggleSelect,
  onToggleAll,
  onToggleExpand,
  onRestore,
  onEnroll,
}: {
  rows: DecoratedProject[];
  selection: Set<string>;
  expanded: Set<string>;
  sort: SortKey;
  direction: "asc" | "desc";
  sweeping: boolean;
  density: "comfortable" | "compact";
  disabled?: boolean;
  onToggleSort: (key: SortKey) => void;
  onToggleSelect: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onToggleExpand: (key: string) => void;
  onRestore: (project: DashboardProject) => void;
  onEnroll: (project: DashboardProject) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selection.has(rowKey(row)));
  const someSelected = rows.some((row) => selection.has(rowKey(row)));

  return (
    <div className="panel" data-density={density}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-select">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={onToggleAll}
                  label="Select all visible projects"
                  disabled={disabled}
                />
              </th>
              {COLUMNS.map(({ key, label }) => (
                <th key={label}>
                  {key ? (
                    <button
                      type="button"
                      className="sort-button"
                      data-active={sort === key}
                      onClick={() => onToggleSort(key)}
                      aria-label={`Sort by ${label}`}
                    >
                      {label}
                      {sort === key ? (
                        direction === "asc" ? (
                          <ArrowUp size={11} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={11} aria-hidden="true" />
                        )
                      ) : null}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
              <th className="col-actions">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
            {/* The focal moment: a tide advancing across the header on a sweep. */}
            <tr aria-hidden="true">
              <td colSpan={8} style={{ padding: 0, border: 0, height: 0 }}>
                <div className="tide-line" data-sweeping={sweeping} />
              </td>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              return (
                <ProjectRow
                  key={key}
                  project={row.project}
                  protection={row.protection}
                  selected={selection.has(key)}
                  expanded={expanded.has(key)}
                  disabled={disabled}
                  onToggleSelect={() => onToggleSelect(key)}
                  onToggleExpand={() => onToggleExpand(key)}
                  onRestore={() => onRestore(row.project)}
                  onEnroll={() => onEnroll(row.project)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
