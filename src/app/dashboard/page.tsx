"use client";

/**
 * THESIS: A tide table — every project draining toward a pause, ordered by who
 * runs aground first.
 * OWN-WORLD: Slate-indigo ground, verdigris, brass, flare. Margin drawn, not
 * described.
 * STORY: Exposure (who is at risk) → the tide (the table) → action.
 * FIRST VIEWPORT: Header, five-tile risk strip, filters, six rows at 1440×900.
 * FORM: One dominant table on a dark ground with a persistent rail.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FolderKanban, Plus, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BatchBar } from "@/features/projects/components/batch-bar";
import { FilterBar } from "@/features/projects/components/filter-bar";
import { MetricStrip } from "@/features/projects/components/metric-strip";
import { ProjectTable } from "@/features/projects/components/project-table";
import { useProjectFilters, type RiskFilter } from "@/features/projects/hooks/use-project-filters";
import { previewProjects } from "@/features/projects/preview-data";
import type { DashboardProject } from "@/features/projects/project-types";
import { api } from "@/shared/api-client";
import { useNow } from "@/shared/time/use-now";

const keyOf = (project: DashboardProject) =>
  `${project.accountId}:${project.projectRef}`;

/** Batch restores run two at a time so Supabase does not rate-limit the group. */
async function inBatches<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<unknown>,
) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      // One failure must never abort the rest of the batch.
      await run(item).catch(() => undefined);
    }
  });
  await Promise.all(workers);
}

function DashboardContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preview =
    process.env.NODE_ENV === "development" && searchParams.get("preview") === "1";

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [restoreTarget, setRestoreTarget] = useState<DashboardProject | null>(null);
  const [batchTarget, setBatchTarget] = useState<DashboardProject[] | null>(null);
  const [sweeping, setSweeping] = useState(false);
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

  // One clock for the whole table, bucketed to the minute, so every row grades
  // its margin against the same instant and relative times tick on their own.
  const now = useNow();

  const filters = useProjectFilters(projects, now);

  /** Fires the tide line. Only ever called for a genuine sweep. */
  const runSweep = useCallback(() => {
    setSweeping(true);
    window.setTimeout(() => setSweeping(false), 950);
  }, []);

  const refresh = useMutation({
    mutationFn: () => api("/api/refresh", { method: "POST", interaction: true }),
    onMutate: runSweep,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const batchRestore = useMutation({
    mutationFn: async (targets: DashboardProject[]) => {
      runSweep();
      await inBatches(targets, 2, (project) => restore.mutateAsync(project));
    },
    onSuccess: () => {
      setBatchTarget(null);
      setSelection(new Set());
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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

  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const selected = useMemo(
    () => filters.visible.filter((row) => selection.has(keyOf(row.project))),
    [filters.visible, selection],
  );

  const restorable = selected
    .filter((row) => row.project.lifecycleStatus === "paused")
    .map((row) => row.project);

  const enrollable = selected
    .filter((row) => row.protection.state === "unprotected")
    .map((row) => row.project);

  const stale = projects.some((project) => project.accountLastErrorCode);
  const busy = refresh.isPending || batchRestore.isPending;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-copy">
            Every connected Supabase account, ordered by how close each project is
            to pausing.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => refresh.mutate()}
            disabled={busy || preview}
            title={preview ? "Refresh is disabled in visual preview" : undefined}
          >
            <RefreshCw size={15} className={refresh.isPending ? "spin" : ""} />
            {refresh.isPending ? "Sweeping…" : "Sweep now"}
          </button>
          <Link className="button button-secondary" href="/accounts">
            <Plus size={15} />
            Add account
          </Link>
        </div>
      </header>

      <MetricStrip
        counts={filters.counts}
        active={filters.risk}
        onSelect={(risk: RiskFilter) =>
          filters.setParam({ risk: risk === "all" ? null : risk })
        }
      />

      {stale || preview ? (
        <div className="notice">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>Showing cached data.</strong>{" "}
            {preview
              ? "This development preview uses representative local data."
              : "At least one account could not refresh. Its last successful data is preserved."}
          </span>
        </div>
      ) : null}

      <FilterBar
        search={filters.search}
        account={filters.account}
        organization={filters.organization}
        accountOptions={filters.accountOptions}
        organizationOptions={filters.organizationOptions}
        density={density}
        hasFilters={filters.hasFilters}
        onChange={filters.setParam}
        onClear={() =>
          filters.setParam({ q: null, account: null, org: null, risk: null })
        }
        onToggleDensity={() =>
          setDensity((value) =>
            value === "compact" ? "comfortable" : "compact",
          )
        }
      />

      {projectsQuery.isLoading && !preview ? (
        <div className="panel">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton-row" />
          ))}
          <span className="visually-hidden">Loading cached projects</span>
        </div>
      ) : projectsQuery.error && !preview ? (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-inner">
              <span className="empty-icon">
                <AlertTriangle size={20} />
              </span>
              <h2>Harbor could not load projects</h2>
              <p>{projectsQuery.error.message}</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => projectsQuery.refetch()}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-inner">
              <span className="empty-icon">
                <FolderKanban size={20} />
              </span>
              <h2>No projects yet</h2>
              <p>
                Connect a Supabase account with a Personal Access Token. Harbor
                validates it before storing an encrypted connection.
              </p>
              <Link className="button button-primary" href="/accounts">
                <Plus size={15} />
                Add account
              </Link>
            </div>
          </div>
        </div>
      ) : filters.visible.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-inner">
              <h2>Nothing matches these filters</h2>
              <p>Clear a filter or search term to see the rest of your cache.</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  filters.setParam({
                    q: null,
                    account: null,
                    org: null,
                    risk: null,
                  })
                }
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ProjectTable
          rows={filters.visible}
          selection={selection}
          expanded={expanded}
          sort={filters.sort}
          direction={filters.direction}
          sweeping={sweeping}
          density={density}
          disabled={preview}
          onToggleSort={filters.toggleSort}
          onToggleSelect={(key) => setSelection((set) => toggleIn(set, key))}
          onToggleAll={(checked) =>
            setSelection(
              checked
                ? new Set(filters.visible.map((row) => keyOf(row.project)))
                : new Set(),
            )
          }
          onToggleExpand={(key) => setExpanded((set) => toggleIn(set, key))}
          onRestore={setRestoreTarget}
          onEnroll={() => router.push("/keepalive")}
        />
      )}

      <AnimatePresence>
        {selection.size > 0 ? (
          <BatchBar
            selectedCount={selection.size}
            restorableCount={restorable.length}
            enrollableCount={enrollable.length}
            pending={busy}
            onRestore={() => setBatchTarget(restorable)}
            onEnroll={() => router.push("/keepalive")}
            onRefresh={() => refresh.mutate()}
            onClear={() => setSelection(new Set())}
          />
        ) : null}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore paused project?"
        description={
          restoreTarget ? (
            <div>
              Harbor will ask Supabase to restore{" "}
              <strong>{restoreTarget.name}</strong> through the{" "}
              <strong>{restoreTarget.accountLabel}</strong> account. This usually
              takes several minutes.
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
        onConfirm={() => {
          if (!restoreTarget) return;
          restore.mutate(restoreTarget, {
            onSuccess: () => setRestoreTarget(null),
          });
        }}
      />

      <ConfirmDialog
        open={Boolean(batchTarget?.length)}
        onOpenChange={(open) => !open && setBatchTarget(null)}
        title={`Restore ${batchTarget?.length ?? 0} projects?`}
        description={
          <div>
            Harbor will ask Supabase to restore these projects, two at a time:
            <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              {batchTarget?.map((project) => (
                <li key={keyOf(project)}>
                  {project.name}{" "}
                  <span className="cell-secondary">{project.accountLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Restore all"
        pending={batchRestore.isPending}
        onConfirm={() => batchTarget && batchRestore.mutate(batchTarget)}
      />
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <TooltipProvider delayDuration={250}>
      <Suspense
        fallback={
          <AppShell>
            <div className="empty-state">
              <p className="page-copy">Preparing the tide table…</p>
            </div>
          </AppShell>
        }
      >
        <DashboardContent />
      </Suspense>
    </TooltipProvider>
  );
}
