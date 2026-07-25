"use client";

/**
 * THESIS: A quiet harbor watchfloor with one dominant operational table.
 * OWN-WORLD: Navy rail, mist canvas, sea-glass teal, steel dividers.
 * STORY: Projects → counts → control → stale context → evidence-rich rows.
 * FIRST VIEWPORT: Header, metrics, notice, filters, and five rows at 1440×900.
 * FORM: Restrained control room pinned by the approved concept and 21st.dev research.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleCheck,
  Clock3,
  FolderKanban,
  HeartPulse,
  Pause,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import { previewProjects } from "@/features/projects/preview-data";
import type { DashboardProject } from "@/features/projects/project-types";
import { api } from "@/shared/api-client";

function Status({
  lifecycle,
  health,
}: {
  lifecycle: DashboardProject["lifecycleStatus"];
  health: DashboardProject["healthStatus"];
}) {
  const isUnhealthy = health === "unhealthy";
  const value = isUnhealthy ? "unhealthy" : lifecycle;
  const Icon =
    value === "active"
      ? CircleCheck
      : value === "paused"
        ? Pause
        : value === "unhealthy" || value === "failed"
          ? AlertTriangle
          : Clock3;
  return (
    <span className={`status status-${value}`}>
      <Icon />
      {value}
    </span>
  );
}

function formatRefreshTime(value: string) {
  const date = new Date(value);
  return `${date.toISOString().slice(11, 16)} UTC`;
}

function DashboardContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const preview =
    process.env.NODE_ENV === "development" &&
    searchParams.get("preview") === "1";
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("");
  const [organization, setOrganization] = useState("");
  const [status, setStatus] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<DashboardProject | null>(
    null,
  );
  const initialRefreshStarted = useRef(false);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<DashboardProject[]>("/api/projects"),
    enabled: !preview,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 300_000
        : false,
  });
  const projects = useMemo(
    () => (preview ? previewProjects : (projectsQuery.data ?? [])),
    [preview, projectsQuery.data],
  );

  const refresh = useMutation({
    mutationFn: () =>
      api("/api/refresh", { method: "POST", interaction: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  const restore = useMutation({
    mutationFn: (project: DashboardProject) =>
      api<{ id: string }>(
        `/api/projects/${encodeURIComponent(project.projectRef)}/restore`,
        {
          method: "POST",
          body: JSON.stringify({ accountId: project.accountId }),
          interaction: true,
        },
      ),
    onSuccess: (action) => {
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      let attemptsRemaining = 60;
      const reconcile = async () => {
        if (document.visibilityState !== "visible" || attemptsRemaining <= 0) {
          return;
        }
        attemptsRemaining -= 1;
        try {
          const current = await api<{ status: string }>(
            `/api/actions/${action.id}/reconcile`,
            { method: "POST" },
          );
          await queryClient.invalidateQueries({ queryKey: ["projects"] });
          if (!["completed", "failed"].includes(current.status)) {
            window.setTimeout(reconcile, 5_000);
          }
        } catch {
          window.setTimeout(reconcile, 5_000);
        }
      };
      window.setTimeout(reconcile, 5_000);
    },
  });

  useEffect(() => {
    if (preview || initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;
    api("/api/refresh", { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["projects"] }))
      .catch(() => {
        // Cached data and its per-account stale state remain visible.
      });
  }, [preview, queryClient]);

  const accountOptions = useMemo(
    () => [...new Set(projects.map((project) => project.accountLabel))].sort(),
    [projects],
  );
  const organizationOptions = useMemo(
    () =>
      [...new Set(projects.map((project) => project.organizationName))].sort(),
    [projects],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter(
      (project) =>
        (!query ||
          project.name.toLowerCase().includes(query) ||
          project.projectRef.toLowerCase().includes(query)) &&
        (!account || project.accountLabel === account) &&
        (!organization || project.organizationName === organization) &&
        (!status ||
          project.lifecycleStatus === status ||
          project.healthStatus === status),
    );
  }, [projects, search, account, organization, status]);

  const counts = {
    total: projects.length,
    active: projects.filter((project) => project.lifecycleStatus === "active")
      .length,
    paused: projects.filter((project) => project.lifecycleStatus === "paused")
      .length,
    unhealthy: projects.filter(
      (project) => project.healthStatus === "unhealthy",
    ).length,
  };
  const stale = projects.some((project) => project.accountLastErrorCode);

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-copy">
            One operational view across every connected Supabase account.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="button button-primary"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || preview}
            title={
              preview ? "Refresh is disabled in visual preview" : undefined
            }
          >
            <RefreshCw size={16} className={refresh.isPending ? "spin" : ""} />
            {refresh.isPending ? "Refreshing…" : "Refresh all"}
          </button>
          <Link className="button button-secondary" href="/accounts">
            <Plus size={16} />
            Add account
          </Link>
        </div>
      </header>

      <section className="metrics" aria-label="Project summary">
        {[
          {
            label: "Total projects",
            value: counts.total,
            icon: FolderKanban,
            tone: "",
          },
          {
            label: "Active",
            value: counts.active,
            icon: CircleCheck,
            tone: "active",
          },
          {
            label: "Paused",
            value: counts.paused,
            icon: Pause,
            tone: "paused",
          },
          {
            label: "Unhealthy",
            value: counts.unhealthy,
            icon: HeartPulse,
            tone: "unhealthy",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div className="metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className={`metric-icon ${tone}`}>
                <Icon size={15} />
              </span>
            </div>
            <strong className="metric-value">{value}</strong>
          </div>
        ))}
      </section>

      {stale || preview ? (
        <div className="notice">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            <strong>Cached data is still visible.</strong>{" "}
            {preview
              ? "This development preview uses representative local data."
              : "At least one account could not refresh; its last successful data has been preserved."}
          </span>
        </div>
      ) : null}

      <section aria-label="Project filters" className="toolbar">
        <div className="search-wrap">
          <Search size={17} aria-hidden="true" />
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search project name or reference"
            aria-label="Search projects"
          />
        </div>
        <select
          className="select"
          value={account}
          onChange={(event) => setAccount(event.target.value)}
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
          onChange={(event) => setOrganization(event.target.value)}
          aria-label="Filter by organization"
        >
          <option value="">All organizations</option>
          {organizationOptions.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="transitioning">Transitioning</option>
          <option value="unhealthy">Unhealthy</option>
          <option value="failed">Failed</option>
        </select>
      </section>

      <section className="panel">
        {projectsQuery.isLoading && !preview ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <RefreshCw size={24} style={{ color: "var(--teal)" }} />
              <p style={{ marginTop: 12 }}>Loading cached projects…</p>
            </div>
          </div>
        ) : projectsQuery.error && !preview ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <span className="empty-icon">
                <AlertTriangle size={21} />
              </span>
              <h2>Harbor could not load projects</h2>
              <p>{projectsQuery.error.message}</p>
              <button
                className="button button-secondary"
                onClick={() => projectsQuery.refetch()}
              >
                Try again
              </button>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <span className="empty-icon">
                <FolderKanban size={21} />
              </span>
              <h2>No connected projects yet</h2>
              <p>
                Add a Supabase Personal Access Token. Harbor validates it before
                storing an encrypted connection.
              </p>
              <Link className="button button-primary" href="/accounts">
                <Plus size={16} />
                Add account
              </Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <h2>No projects match these filters</h2>
              <p>
                Clear a filter or search term to see the rest of your cache.
              </p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Account</th>
                  <th>Organization</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Last refresh</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => (
                  <tr key={`${project.accountId}:${project.projectRef}`}>
                    <td>
                      <div className="project-name">
                        <span>{project.name}</span>
                        <span className="project-ref">
                          {project.projectRef}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div>
                        {project.accountLabel}
                        <div className="cell-secondary">
                          {project.accountEmail}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        {project.organizationName}
                        <div className="cell-secondary">
                          {project.organizationPlan}
                        </div>
                      </div>
                    </td>
                    <td>{project.region}</td>
                    <td>
                      <Status
                        lifecycle={project.lifecycleStatus}
                        health={project.healthStatus}
                      />
                    </td>
                    <td className="cell-secondary">
                      {project.accountLastSuccessfulSyncAt
                        ? formatRefreshTime(project.accountLastSuccessfulSyncAt)
                        : "Not yet"}
                    </td>
                    <td>
                      {project.lifecycleStatus === "paused" ? (
                        <button
                          className="button button-secondary row-action"
                          onClick={() => setRestoreTarget(project)}
                          disabled={preview}
                        >
                          Restore
                        </button>
                      ) : (
                        <a
                          className="button button-quiet row-action"
                          style={{ color: "var(--muted)" }}
                          href={`https://supabase.com/dashboard/project/${project.projectRef}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${project.name} in Supabase`}
                        >
                          <ArrowUpRight size={15} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore paused project?"
        description={
          restoreTarget ? (
            <div>
              Harbor will ask Supabase to restore{" "}
              <strong>{restoreTarget.name}</strong> through the{" "}
              <strong>{restoreTarget.accountLabel}</strong> account. This may
              take several minutes.
              {restore.error ? (
                <p className="inline-error" style={{ marginTop: 12 }}>
                  {restore.error.message}
                </p>
              ) : null}
            </div>
          ) : null
        }
        confirmLabel="Restore project"
        pending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="empty-state">
            <p>Preparing project dashboard…</p>
          </div>
        </AppShell>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
