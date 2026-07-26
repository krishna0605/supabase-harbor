"use client";

import { Fragment } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  CircleCheck,
  Clock3,
  Pause,
  TriangleAlert,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MarginBar } from "@/features/projects/components/margin-bar";
import type { Protection } from "@/features/keepalive/protection-state";
import type { DashboardProject } from "@/features/projects/project-types";
import { absoluteTime, relativeTime } from "@/shared/time/relative";

const STATUS_ICON = {
  active: CircleCheck,
  healthy: CircleCheck,
  paused: Pause,
  unhealthy: TriangleAlert,
  failed: TriangleAlert,
} as const;

function StatusPill({ project }: { project: DashboardProject }) {
  const value =
    project.healthStatus === "unhealthy" ? "unhealthy" : project.lifecycleStatus;
  const Icon = STATUS_ICON[value as keyof typeof STATUS_ICON] ?? Clock3;

  return (
    <span className={`status status-${value}`}>
      <Icon aria-hidden="true" />
      {value}
    </span>
  );
}

export function ProjectRow({
  project,
  protection,
  selected,
  expanded,
  disabled,
  onToggleSelect,
  onToggleExpand,
  onRestore,
  onEnroll,
}: {
  project: DashboardProject;
  protection: Protection;
  selected: boolean;
  expanded: boolean;
  disabled?: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onRestore: () => void;
  onEnroll: () => void;
}) {
  const lastPing = project.keepaliveLastSuccessAt ?? null;
  const pingTone =
    protection.state === "at-risk"
      ? "crit"
      : protection.state === "slipping"
        ? "warn"
        : undefined;

  return (
    <Fragment>
      <tr data-selected={selected || undefined}>
        <td className="col-select">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            label={`Select ${project.name}`}
            disabled={disabled}
          />
        </td>

        <td data-label="Project">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="expand-toggle"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} details for ${project.name}`}
              onClick={onToggleExpand}
            >
              <ChevronRight size={14} />
            </button>
            <span className="project-name">
              <span>{project.name}</span>
              <span className="project-ref">
                {project.projectRef} · {project.organizationName}
              </span>
            </span>
          </div>
        </td>

        <td data-label="Account">
          <div>
            {project.accountLabel}
            <div className="cell-secondary">{project.accountEmail}</div>
          </div>
        </td>

        <td data-label="Status">
          <StatusPill project={project} />
        </td>

        <td data-label="Protection">
          <span className={`protection protection-${protection.state}`}>
            <span className="protection-dot" aria-hidden="true" />
            {protection.label}
          </span>
        </td>

        <td data-label="Margin">
          <MarginBar protection={protection} />
        </td>

        <td data-label="Last ping">
          <span
            className="cell-time"
            data-tone={pingTone}
            title={absoluteTime(lastPing)}
          >
            {protection.state === "unprotected"
              ? "not enrolled"
              : relativeTime(lastPing)}
          </span>
        </td>

        <td className="col-actions">
          {project.lifecycleStatus === "paused" ? (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={onRestore}
              disabled={disabled}
            >
              Restore
            </button>
          ) : protection.state === "unprotected" ? (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={onEnroll}
              disabled={disabled}
            >
              Enroll
            </button>
          ) : (
            <a
              className="button button-quiet button-small"
              href={`https://supabase.com/dashboard/project/${project.projectRef}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${project.name} in the Supabase dashboard`}
            >
              <ArrowUpRight size={15} />
            </a>
          )}
        </td>
      </tr>

      {expanded ? (
        <tr className="row-expand">
          <td colSpan={8}>
            <div className="expand-inner">
              <div className="expand-group">
                <h4>Placement</h4>
                <dl className="expand-list">
                  <div>
                    <dt>Region</dt>
                    <dd>{project.region}</dd>
                  </div>
                  <div>
                    <dt>Cloud</dt>
                    <dd>{project.cloudProvider}</dd>
                  </div>
                  <div>
                    <dt>Organization</dt>
                    <dd>{project.organizationPlan}</dd>
                  </div>
                </dl>
              </div>

              <div className="expand-group">
                <h4>Upstream</h4>
                <dl className="expand-list">
                  <div>
                    <dt>Raw status</dt>
                    <dd>{project.rawStatus}</dd>
                  </div>
                  <div>
                    <dt>Account synced</dt>
                    <dd title={absoluteTime(project.accountLastSuccessfulSyncAt ?? null)}>
                      {relativeTime(project.accountLastSuccessfulSyncAt ?? null)}
                    </dd>
                  </div>
                  {project.accountLastErrorCode ? (
                    <div>
                      <dt>Last error</dt>
                      <dd>{project.accountLastErrorCode}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="expand-group">
                <h4>Services</h4>
                {project.services?.length ? (
                  <div className="service-chips">
                    {project.services.map((service) => (
                      <span
                        key={service.name}
                        className="service-chip"
                        data-healthy={service.healthy}
                        title={`${service.status}${service.version ? ` · ${service.version}` : ""}`}
                      >
                        {service.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="cell-secondary" style={{ margin: 0 }}>
                    Not checked yet
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
