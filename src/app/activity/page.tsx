"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CircleCheck, Clock3 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/shared/api-client";

type ActivityRow = {
  id: string;
  type: "refresh" | "restore";
  status: string;
  projectRef?: string | null;
  projectName?: string | null;
  accountLabel: string;
  errorCode?: string | null;
  startedAt: string;
  completedAt?: string | null;
};

export default function ActivityPage() {
  const activity = useQuery({
    queryKey: ["activity"],
    queryFn: () => api<ActivityRow[]>("/api/actions"),
  });
  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-copy">
            Local refresh and restore history without upstream payloads or
            secrets.
          </p>
        </div>
      </header>
      <section className="panel">
        {activity.isLoading ? (
          <div className="empty-state">
            <p>Loading activity…</p>
          </div>
        ) : activity.error ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <AlertTriangle size={22} style={{ color: "var(--flare)" }} />
              <p style={{ marginTop: 10 }}>{activity.error.message}</p>
            </div>
          </div>
        ) : activity.data?.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Account</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {activity.data.map((item) => {
                  const successful = ["completed", "accepted"].includes(
                    item.status,
                  );
                  const failed = item.status === "failed";
                  const Icon = failed
                    ? AlertTriangle
                    : successful
                      ? CircleCheck
                      : Clock3;
                  return (
                    <tr key={item.id}>
                      <td
                        style={{ textTransform: "capitalize", fontWeight: 650 }}
                      >
                        {item.type}
                      </td>
                      <td>{item.accountLabel}</td>
                      <td>
                        {item.projectName ?? "—"}
                        {item.projectRef ? (
                          <div className="cell-secondary">
                            {item.projectRef}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`status status-${failed ? "failed" : successful ? "active" : "transitioning"}`}
                        >
                          <Icon />
                          {item.status}
                        </span>
                        {item.errorCode ? (
                          <div
                            className="cell-secondary"
                            style={{ marginTop: 4 }}
                          >
                            {item.errorCode}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.startedAt))}
                      </td>
                      <td>
                        {item.completedAt
                          ? new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(item.completedAt))
                          : "In progress"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-inner">
              <span className="empty-icon">
                <Activity size={21} />
              </span>
              <h2>No activity yet</h2>
              <p>Refreshes and restore attempts will be recorded here.</p>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
