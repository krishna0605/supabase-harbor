"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  Play,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  CLEANUP_SQL,
  ENROLLMENT_SQL,
  sqlEditorUrl,
} from "@/features/keepalive/enrollment-sql";
import type { KeepaliveOverview } from "@/features/keepalive/keepalive-types";
import { isKnownPaidPlan } from "@/features/keepalive/plan-eligibility";
import { protectionOf } from "@/features/keepalive/protection-state";
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
    <button
      type="button"
      className="button button-secondary button-small"
      onClick={copy}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export default function KeepalivePage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DashboardProject | null>(null);
  const [removeTarget, setRemoveTarget] = useState<DashboardProject | null>(
    null,
  );
  const [manualKey, setManualKey] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<DashboardProject[]>("/api/projects"),
  });
  const keepaliveQuery = useQuery({
    queryKey: ["keepalive"],
    queryFn: () => api<KeepaliveOverview>("/api/keepalive"),
    refetchInterval: 15_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["keepalive"] }),
    ]);
  };

  const enroll = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return api(
        `/api/projects/${encodeURIComponent(selected.projectRef)}/keepalive`,
        {
          method: "POST",
          interaction: true,
          body: JSON.stringify({
            accountId: selected.accountId,
            publishableKey: manualMode ? manualKey : undefined,
          }),
        },
      );
    },
    onSuccess: async () => {
      setMessage("Heartbeat verified. The next daily run is scheduled.");
      setSelected(null);
      setManualKey("");
      setManualMode(false);
      await refresh();
    },
    onError: (error: Error & { code?: string }) => {
      if (error.code === "KEEPALIVE_KEY_PERMISSION_REQUIRED")
        setManualMode(true);
      setMessage(error.message);
    },
  });

  const toggle = useMutation({
    mutationFn: (input: { project: DashboardProject; enabled: boolean }) =>
      api(
        `/api/projects/${encodeURIComponent(input.project.projectRef)}/keepalive`,
        {
          method: "PATCH",
          interaction: true,
          body: JSON.stringify({
            accountId: input.project.accountId,
            enabled: input.enabled,
          }),
        },
      ),
    onSuccess: refresh,
    onError: (error: Error) => setMessage(error.message),
  });

  const runNow = useMutation({
    mutationFn: (project: DashboardProject) =>
      api(
        `/api/projects/${encodeURIComponent(project.projectRef)}/keepalive/run`,
        {
          method: "POST",
          interaction: true,
          body: JSON.stringify({ accountId: project.accountId }),
        },
      ),
    onSuccess: async () => {
      setMessage("Heartbeat queued. The worker will pick it up shortly.");
      await refresh();
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const remove = useMutation({
    mutationFn: (project: DashboardProject) =>
      api(`/api/projects/${encodeURIComponent(project.projectRef)}/keepalive`, {
        method: "DELETE",
        interaction: true,
        body: JSON.stringify({ accountId: project.accountId }),
      }),
    onSuccess: async () => {
      setRemoveTarget(null);
      setMessage("Harbor enrollment removed. Nothing was deleted in Supabase.");
      await refresh();
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );
  const now = useNow() || PREVIEW_EPOCH;
  const rows = useMemo(
    () =>
      projects
        .map((project) => ({
          project,
          protection: protectionOf(
            {
              enrolled:
                project.keepaliveEnrolled && project.keepaliveEnabled !== false,
              lastSuccessAt: project.keepaliveLastSuccessAt,
              paused: project.lifecycleStatus === "paused",
            },
            now,
          ),
        }))
        .sort((a, b) => a.protection.marginDays - b.protection.marginDays),
    [projects, now],
  );

  const enabled = rows.filter(
    ({ project }) => project.keepaliveEnrolled && project.keepaliveEnabled,
  ).length;
  const needsAttention = rows.filter(
    ({ project }) => project.keepaliveNeedsAttention,
  ).length;
  const current = rows.filter(
    ({ protection }) => protection.state === "protected",
  ).length;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Keepalive</h1>
          <p className="page-copy">
            Enrolled Free Plan projects receive a small daily database
            heartbeat. This reduces pause risk, but Supabase does not guarantee
            that one heartbeat prevents pausing.
          </p>
        </div>
      </header>

      {message ? (
        <div className="notice" role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{message}</span>
          <button
            className="button button-ghost button-small"
            onClick={() => setMessage(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="summary-grid" aria-label="Keepalive coverage">
        <div className="summary-card">
          <span className="summary-label">Enabled</span>
          <strong>{enabled}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Current</span>
          <strong>{current}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Needs attention</span>
          <strong>{needsAttention}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Not enrolled</span>
          <strong>
            {rows.length -
              rows.filter((row) => row.project.keepaliveEnrolled).length}
          </strong>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Project coverage</h2>
          <span
            className="cell-secondary"
            title={absoluteTime(
              keepaliveQuery.data?.worker.lastCompletedAt ?? null,
            )}
          >
            Worker:{" "}
            {keepaliveQuery.data?.worker.status === "healthy"
              ? "Healthy"
              : keepaliveQuery.data?.worker.status === "delayed"
                ? "Delayed"
                : "Unknown"}
            {keepaliveQuery.data?.worker.lastCompletedAt
              ? ` · ${relativeTime(keepaliveQuery.data.worker.lastCompletedAt)}`
              : " · no completed sweep"}
          </span>
        </div>

        {projectsQuery.isLoading ? (
          <div>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton-row" />
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
            <table className="data-table" style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>State</th>
                  <th>Last success</th>
                  <th>Next run</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ project, protection }) => (
                  <tr key={`${project.accountId}:${project.projectRef}`}>
                    <td>
                      <span className="project-name">
                        <span>{project.name}</span>
                        <span className="project-ref">
                          {project.projectRef} · {project.accountLabel}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`protection protection-${protection.state}`}
                      >
                        <span className="protection-dot" aria-hidden="true" />
                        {project.keepaliveNeedsAttention
                          ? "Needs attention"
                          : project.keepaliveEnrolled &&
                              !project.keepaliveEnabled
                            ? "Disabled"
                            : protection.label}
                      </span>
                    </td>
                    <td>
                      <span
                        className="cell-time"
                        title={absoluteTime(project.keepaliveLastSuccessAt)}
                      >
                        {project.keepaliveLastSuccessAt
                          ? relativeTime(project.keepaliveLastSuccessAt)
                          : "never"}
                      </span>
                    </td>
                    <td>
                      {keepaliveQuery.data?.enrollments.find(
                        (item) =>
                          item.accountId === project.accountId &&
                          item.projectRef === project.projectRef,
                      )?.nextRunAt
                        ? relativeTime(
                            keepaliveQuery.data.enrollments.find(
                              (item) =>
                                item.accountId === project.accountId &&
                                item.projectRef === project.projectRef,
                            )?.nextRunAt ?? null,
                          )
                        : "—"}
                    </td>
                    <td className="col-actions">
                      {project.keepaliveEnrolled ? (
                        <div className="button-row">
                          <Switch
                            checked={project.keepaliveEnabled === true}
                            disabled={toggle.isPending}
                            label={`${project.keepaliveEnabled ? "Disable" : "Enable"} heartbeat for ${project.name}`}
                            onCheckedChange={(checked) =>
                              toggle.mutate({ project, enabled: checked })
                            }
                          />
                          <button
                            className="button button-secondary button-small"
                            disabled={
                              project.keepaliveEnabled !== true ||
                              runNow.isPending
                            }
                            onClick={() => runNow.mutate(project)}
                          >
                            <Play size={13} /> Run now
                          </button>
                          <button
                            className="button button-ghost button-small"
                            aria-label={`Remove ${project.name} enrollment`}
                            onClick={() => setRemoveTarget(project)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="button button-primary button-small"
                          disabled={
                            project.lifecycleStatus !== "active" ||
                            isKnownPaidPlan(project.organizationPlan)
                          }
                          onClick={() => {
                            setMessage(null);
                            setSelected(project);
                          }}
                        >
                          Enroll
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-header">
          <h2>Recent attempts</h2>
          <span className="cell-secondary">
            Last {keepaliveQuery.data?.attempts.length ?? 0}
          </span>
        </div>
        <div className="panel-body">
          {keepaliveQuery.data?.attempts.length ? (
            keepaliveQuery.data.attempts.slice(0, 8).map((attempt) => (
              <div className="activity-row" key={attempt.id}>
                <span
                  className={`status-dot status-${attempt.status === "succeeded" ? "success" : "error"}`}
                />
                <span>{attempt.projectRef}</span>
                <span className="cell-secondary">
                  {attempt.status === "succeeded"
                    ? "Heartbeat current"
                    : attempt.errorCode}
                </span>
                <span className="cell-time">
                  {relativeTime(attempt.completedAt)}
                </span>
              </div>
            ))
          ) : (
            <p className="page-copy">No heartbeat attempts have run yet.</p>
          )}
        </div>
      </section>

      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setManualMode(false);
            setManualKey("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content" style={{ maxWidth: 720 }}>
            <Dialog.Title className="dialog-title">
              Enroll {selected?.name}
            </Dialog.Title>
            <Dialog.Description className="dialog-copy">
              First install the restricted heartbeat function, then let Harbor
              discover and verify a low-privilege project key.
            </Dialog.Description>
            <div
              className="dialog-actions"
              style={{ justifyContent: "space-between" }}
            >
              <CopyButton value={ENROLLMENT_SQL} label="Copy enrollment SQL" />
              {selected ? (
                <a
                  className="button button-secondary button-small"
                  href={sqlEditorUrl(selected.projectRef)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open SQL editor <ArrowUpRight size={13} />
                </a>
              ) : null}
            </div>
            <textarea
              className="textarea"
              readOnly
              value={ENROLLMENT_SQL}
              rows={9}
              aria-label="Keepalive enrollment SQL"
              onFocus={(event) => event.currentTarget.select()}
            />
            {manualMode ? (
              <label className="field">
                <span className="field-label">
                  Publishable or legacy anon key
                </span>
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={manualKey}
                  onChange={(event) => setManualKey(event.target.value)}
                  placeholder="sb_publishable_…"
                />
                <span className="field-hint">
                  Secret and service-role keys are rejected before storage.
                </span>
              </label>
            ) : null}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button
                  className="button button-secondary"
                  disabled={enroll.isPending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                className="button button-primary"
                disabled={enroll.isPending || (manualMode && !manualKey.trim())}
                onClick={() => enroll.mutate()}
              >
                {enroll.isPending
                  ? "Verifying…"
                  : manualMode
                    ? "Verify manual key"
                    : "Discover and verify"}
              </button>
            </div>
            <Dialog.Close className="dialog-close" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? "project"} from Harbor?`}
        description={
          <div>
            <p>
              This removes Harbor&apos;s encrypted credential and queued jobs.
              It does not delete anything in Supabase.
            </p>
            <CopyButton value={CLEANUP_SQL} label="Copy optional cleanup SQL" />
          </div>
        }
        confirmLabel="Remove enrollment"
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget)}
      />
    </AppShell>
  );
}
