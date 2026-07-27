"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/shared/api-client";

type Settings = {
  refresh_interval_minutes: string;
  idle_timeout_minutes: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [resetText, setResetText] = useState("");
  const [message, setMessage] = useState("");
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/api/settings"),
  });
  const save = useMutation({
    mutationFn: (value: {
      refreshIntervalMinutes: number;
      idleTimeoutMinutes: number;
    }) =>
      api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(value),
        interaction: true,
      }),
    onSuccess: () => {
      setMessage("Preferences saved.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const password = useMutation({
    mutationFn: (value: { newPassword: string; confirmation: string }) =>
      api("/api/vault/change-password", {
        method: "POST",
        body: JSON.stringify(value),
        interaction: true,
      }),
    onSuccess: () => setMessage("Master password changed."),
  });

  async function lock() {
    await api("/api/vault/lock", { method: "POST", interaction: true });
    router.replace("/unlock");
  }

  async function reset() {
    await api("/api/vault", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: resetText }),
      interaction: true,
    });
    router.replace("/setup");
  }

  function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    save.mutate({
      refreshIntervalMinutes: Number(form.get("refresh")),
      idleTimeoutMinutes: Number(form.get("idle")),
    });
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    password.mutate({
      newPassword: String(form.get("password")),
      confirmation: String(form.get("confirmation")),
    });
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-copy">
            Tune local behavior, rotate the vault password, or inspect data
            locations.
          </p>
        </div>
      </header>
      {message ? (
        <p className="inline-success" style={{ marginBottom: 14 }}>
          {message}
        </p>
      ) : null}
      <section className="panel">
        <div className="setting-section">
          <h2>
            <RefreshCw
              size={16}
              style={{ display: "inline", marginRight: 8 }}
            />
            Refresh and locking
          </h2>
          <p>
            Background refresh only runs while a dashboard tab is visible and
            never extends the idle timeout.
          </p>
          {settings.data ? (
            <form className="setting-form" onSubmit={submitPreferences}>
              <div className="field">
                <label htmlFor="refresh">Refresh interval</label>
                <select
                  className="select"
                  id="refresh"
                  name="refresh"
                  defaultValue={settings.data.refresh_interval_minutes}
                >
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="idle">Lock after inactivity</label>
                <select
                  className="select"
                  id="idle"
                  name="idle"
                  defaultValue={settings.data.idle_timeout_minutes}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                </select>
              </div>
              <button
                className="button button-secondary"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save preferences"}
              </button>
            </form>
          ) : null}
          {save.error ? (
            <p className="inline-error" style={{ marginTop: 12 }}>
              {save.error.message}
            </p>
          ) : null}
        </div>

        <div className="setting-section">
          <h2>
            <KeyRound size={16} style={{ display: "inline", marginRight: 8 }} />
            Master password
          </h2>
          <p>
            Changing the password rewraps the vault key; connected tokens do not
            need to be re-encrypted.
          </p>
          <form className="setting-form" onSubmit={submitPassword}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                minLength={12}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirmation">Confirm password</label>
              <input
                className="input"
                id="confirmation"
                name="confirmation"
                type="password"
                minLength={12}
                required
              />
            </div>
            <button
              className="button button-secondary"
              disabled={password.isPending}
            >
              {password.isPending ? "Changing…" : "Change password"}
            </button>
          </form>
          {password.error ? (
            <p className="inline-error" style={{ marginTop: 12 }}>
              {password.error.message}
            </p>
          ) : null}
        </div>

        <div className="setting-section">
          <h2>
            <LockKeyhole
              size={16}
              style={{ display: "inline", marginRight: 8 }}
            />
            Lock now
          </h2>
          <p>
            Clear active sessions and best-effort wipe the in-memory vault key
            immediately.
          </p>
          <button className="button button-secondary" onClick={lock}>
            Lock Harbor
          </button>
        </div>

        <div className="setting-section">
          <h2>
            <Database size={16} style={{ display: "inline", marginRight: 8 }} />
            Data locations
          </h2>
          <p>
            Database: <code>Connected Neon Postgres database</code>
            <br />
            Logs: <code>%LOCALAPPDATA%\SupabaseHarbor\logs\harbor.log</code>
          </p>
        </div>

        <div className="setting-section">
          <h2 style={{ color: "var(--flare)" }}>
            <ShieldAlert
              size={16}
              style={{ display: "inline", marginRight: 8 }}
            />
            Reset Harbor data
          </h2>
          <p>
            Deletes Harbor’s encrypted tokens, project cache, settings, and
            activity from the connected Neon database. It does not delete
            anything in Supabase.
          </p>
          <div className="setting-form">
            <div className="field">
              <label htmlFor="reset">Type RESET HARBOR</label>
              <input
                className="input"
                id="reset"
                value={resetText}
                onChange={(event) => setResetText(event.target.value)}
              />
            </div>
            <button
              className="button button-danger"
              disabled={resetText !== "RESET HARBOR"}
              onClick={reset}
            >
              Reset local vault
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
