"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ENROLLMENT_SQL, sqlEditorUrl } from "@/features/keepalive/enrollment-sql";
import {
  PAUSE_WINDOW_DAYS,
  protectionOf,
} from "@/features/keepalive/protection-state";
import { PREVIEW_EPOCH } from "@/features/projects/preview-data";
import type { DashboardProject } from "@/features/projects/project-types";
import { api } from "@/shared/api-client";
import { absoluteTime, relativeTime } from "@/shared/time/relative";
import { useNow } from "@/shared/time/use-now";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" className="button button-secondary button-small" onClick={copy}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export default function KeepalivePage() {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<DashboardProject[]>("/api/projects"),
  });

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );

  const tick = useNow();
  const now = tick || PREVIEW_EPOCH;

  const rows = useMemo(
    () =>
      projects
        .map((project) => ({
          project,
          protection: protectionOf(
            {
              enrolled: Boolean(project.keepaliveEnrolled),
              lastSuccessAt: project.keepaliveLastSuccessAt ?? null,
              paused: project.lifecycleStatus === "paused",
            },
            now,
          ),
        }))
        .sort((a, b) => a.protection.marginDays - b.protection.marginDays),
    [projects, now],
  );

  const unprotected = rows.filter(
    (row) => row.protection.state === "unprotected",
  ).length;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Keepalive</h1>
          <p className="page-copy">
            Supabase pauses a Free Plan project after {PAUSE_WINDOW_DAYS} days of low
            database activity. Enrolled projects get a small, real write on a
            schedule so the clock never runs out.
          </p>
        </div>
      </header>

      <div className="notice">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>
          <strong>The sweep engine is not running yet.</strong> You can prepare
          projects now by running the SQL below in each one. Harbor will start
          pinging them once the worker ships.
        </span>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="section-header">
            <h2>Project coverage</h2>
            <span className="cell-secondary">
              {unprotected} of {rows.length} unprotected
            </span>
          </div>

          {projectsQuery.isLoading ? (
            <div>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="skeleton-row" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <span className="empty-icon">
                  <ShieldCheck size={20} />
                </span>
                <h2>No projects to protect yet</h2>
                <p>Connect a Supabase account first, then come back to enroll.</p>
                <Link className="button button-primary" href="/accounts">
                  Add account
                </Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Protection</th>
                    <th>Last ping</th>
                    <th className="col-actions">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ project, protection }) => (
                    <tr key={`${project.accountId}:${project.projectRef}`}>
                      <td data-label="Project">
                        <span className="project-name">
                          <span>{project.name}</span>
                          <span className="project-ref">
                            {project.projectRef} · {project.accountLabel}
                          </span>
                        </span>
                      </td>
                      <td data-label="Protection">
                        <span className={`protection protection-${protection.state}`}>
                          <span className="protection-dot" aria-hidden="true" />
                          {protection.label}
                        </span>
                      </td>
                      <td data-label="Last ping">
                        <span
                          className="cell-time"
                          title={absoluteTime(project.keepaliveLastSuccessAt ?? null)}
                        >
                          {protection.state === "unprotected"
                            ? "not enrolled"
                            : relativeTime(project.keepaliveLastSuccessAt ?? null)}
                        </span>
                      </td>
                      <td className="col-actions">
                        <a
                          className="button button-secondary button-small"
                          href={sqlEditorUrl(project.projectRef)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          SQL editor
                          <ArrowUpRight size={13} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Enrollment SQL</h2>
            <CopyButton value={ENROLLMENT_SQL} label="Copy" />
          </div>
          <div className="panel-body">
            <p className="page-copy" style={{ marginTop: 0 }}>
              Run this once per project. It creates a single-row heartbeat table
              with row-level security on and <strong>no policies</strong>, so the
              table itself stays unreachable. The only thing exposed to the{" "}
              <code>anon</code> role is a function that takes no arguments and
              returns one timestamp.
            </p>
            <p className="page-copy">
              Harbor never runs SQL against your database. It shows you this; you
              run it.
            </p>
            <textarea
              className="textarea"
              readOnly
              value={ENROLLMENT_SQL}
              rows={18}
              aria-label="Keepalive enrollment SQL"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
