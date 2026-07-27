"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/shared/api-client";

type Settings = {
  refresh_interval_minutes: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/api/settings"),
  });
  const save = useMutation({
    mutationFn: (refreshIntervalMinutes: number) =>
      api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ refreshIntervalMinutes }),
        interaction: true,
      }),
    onSuccess: () => {
      setMessage("Preferences saved.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const removeData = useMutation({
    mutationFn: () =>
      api("/api/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
        interaction: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace("/accounts");
    },
  });

  function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    save.mutate(Number(form.get("refresh")));
  }

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-copy">
            Tune dashboard refresh and manage only your Harbor tenant.
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
            Dashboard refresh
          </h2>
          <p>
            Automatic refresh runs only while a dashboard tab is visible.
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
              <button
                className="button button-secondary"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save preference"}
              </button>
            </form>
          ) : null}
        </div>

        <div className="setting-section">
          <h2>
            <KeyRound size={16} style={{ display: "inline", marginRight: 8 }} />
            Encrypted credentials
          </h2>
          <p>
            Each user has an independent data-encryption key. Supabase tokens
            are decrypted only for the current server operation and are never
            returned to the browser.
          </p>
        </div>

        <div className="setting-section">
          <h2>
            <Database size={16} style={{ display: "inline", marginRight: 8 }} />
            Hosted storage
          </h2>
          <p>
            Neon Postgres stores tenant-isolated encrypted credentials,
            project cache, preferences, and activity. The hosting operator
            controls the server encryption root key.
          </p>
        </div>

        <div className="setting-section">
          <h2 style={{ color: "var(--flare)" }}>
            <ShieldAlert
              size={16}
              style={{ display: "inline", marginRight: 8 }}
            />
            Delete my Harbor data
          </h2>
          <p>
            Deletes only your encrypted tokens, cached projects, preferences,
            and Harbor activity. It never deletes or changes a Supabase
            project.
          </p>
          <div className="setting-form">
            <div className="field">
              <label htmlFor="delete-data">
                Type DELETE MY HARBOR DATA
              </label>
              <input
                className="input"
                id="delete-data"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            <button
              className="button button-danger"
              disabled={
                confirmation !== "DELETE MY HARBOR DATA" ||
                removeData.isPending
              }
              onClick={() => removeData.mutate()}
            >
              {removeData.isPending ? "Deleting…" : "Delete my Harbor data"}
            </button>
            {removeData.error ? (
              <p className="inline-error">{removeData.error.message}</p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
