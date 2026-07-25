"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { SecurityNote } from "@/components/feedback/security-note";
import { api } from "@/shared/api-client";

export default function UnlockPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await api("/api/vault/unlock", {
        method: "POST",
        body: JSON.stringify({ password: form.get("password") }),
        interaction: true,
      });
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unlock failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-main">
          <Brand />
          <p className="eyebrow" style={{ marginTop: 28 }}>
            Vault locked
          </p>
          <h1 className="auth-title" style={{ marginTop: 0 }}>
            Welcome back
          </h1>
          <p className="auth-copy">
            Unlock Harbor to decrypt your account connections in local server
            memory.
          </p>
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">Master password</label>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            {error ? <p className="inline-error">{error}</p> : null}
            <button
              className="button button-primary full-width"
              disabled={pending}
            >
              {pending ? "Unlocking…" : "Unlock Harbor"}
            </button>
          </form>
        </section>
        <SecurityNote />
      </div>
    </div>
  );
}
