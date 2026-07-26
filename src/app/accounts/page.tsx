"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleCheck,
  KeyRound,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { HarborAccount } from "@/features/projects/project-types";
import { api } from "@/shared/api-client";

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [removeTarget, setRemoveTarget] = useState<HarborAccount | null>(null);
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<HarborAccount[]>("/api/accounts"),
  });
  const add = useMutation({
    mutationFn: (value: { label: string; token: string }) =>
      api("/api/accounts", {
        method: "POST",
        body: JSON.stringify(value),
        interaction: true,
      }),
    onSuccess: () => {
      setMessage("Account connected. The token will not be shown again.");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const patch = useMutation({
    mutationFn: (value: { id: string; enabled: boolean }) =>
      api(`/api/accounts/${value.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: value.enabled }),
        interaction: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const refresh = useMutation({
    mutationFn: (id: string) =>
      api(`/api/accounts/${id}/refresh`, {
        method: "POST",
        interaction: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/accounts/${id}`, {
        method: "DELETE",
        interaction: true,
      }),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    await add.mutateAsync({
      label: String(form.get("label") ?? ""),
      token: String(form.get("token") ?? ""),
    });
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-copy">
            Manage local connections. Removing one never deletes anything in
            Supabase.
          </p>
        </div>
      </header>
      <div className="two-column">
        <section className="panel">
          <div className="section-header">
            <h2>Connected accounts</h2>
            <span className="cell-secondary">
              {accounts.data?.length ?? 0} connected
            </span>
          </div>
          {accounts.isLoading ? (
            <div className="empty-state">
              <p>Loading accounts…</p>
            </div>
          ) : accounts.error ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <AlertTriangle size={22} style={{ color: "var(--flare)" }} />
                <p style={{ marginTop: 10 }}>{accounts.error.message}</p>
              </div>
            </div>
          ) : accounts.data?.length ? (
            <div className="account-list">
              {accounts.data.map((account) => (
                <article className="account-row" key={account.id}>
                  <div>
                    <h2 className="account-title">{account.label}</h2>
                    <div className="account-meta">
                      <span>{account.primaryEmail}</span>
                      <span>
                        {account.lastSuccessfulSyncAt
                          ? `Synced ${new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(account.lastSuccessfulSyncAt))}`
                          : "Not refreshed yet"}
                      </span>
                      <span
                        className={`status ${account.enabled ? "status-active" : "status-unknown"}`}
                      >
                        {account.enabled ? <CircleCheck /> : <AlertTriangle />}
                        {account.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {account.lastErrorCode ? (
                      <p className="inline-error" style={{ marginTop: 10 }}>
                        Last refresh: {account.lastErrorCode}
                      </p>
                    ) : null}
                  </div>
                  <div className="account-actions">
                    <button
                      className="button button-secondary row-action"
                      onClick={() => refresh.mutate(account.id)}
                      disabled={!account.enabled || refresh.isPending}
                      aria-label={`Refresh ${account.label}`}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="button button-secondary row-action"
                      onClick={() =>
                        patch.mutate({
                          id: account.id,
                          enabled: !account.enabled,
                        })
                      }
                    >
                      {account.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="button button-danger row-action"
                      onClick={() => setRemoveTarget(account)}
                      aria-label={`Remove ${account.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-inner">
                <span className="empty-icon">
                  <KeyRound size={21} />
                </span>
                <h2>No accounts connected</h2>
                <p>
                  Use the form to validate and securely store your first PAT.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Add an account</h2>
            <UserPlus size={17} style={{ color: "var(--verdigris)" }} />
          </div>
          <form className="panel-body form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="label">Account label</label>
              <input
                className="input"
                id="label"
                name="label"
                placeholder="Personal, Studio, Client…"
                minLength={2}
                maxLength={60}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="token">Personal Access Token</label>
              <textarea
                className="textarea"
                id="token"
                name="token"
                placeholder="sbp_••••••••••••••••"
                spellCheck={false}
                autoComplete="off"
                required
              />
            </div>
            <p className="cell-secondary" style={{ lineHeight: 1.55 }}>
              Harbor validates profile, organization, and project access before
              storing the encrypted token.
            </p>
            {add.error ? (
              <p className="inline-error">{add.error.message}</p>
            ) : null}
            {message ? <p className="inline-success">{message}</p> : null}
            <button
              className="button button-primary full-width"
              disabled={add.isPending}
            >
              {add.isPending ? "Validating…" : "Validate and connect"}
            </button>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove local account?"
        description={
          removeTarget ? (
            <>
              This removes <strong>{removeTarget.label}</strong>, its encrypted
              PAT, and cached metadata from Harbor. It does not delete any
              Supabase project or account.
            </>
          ) : null
        }
        confirmLabel="Remove from Harbor"
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
      />
    </AppShell>
  );
}
