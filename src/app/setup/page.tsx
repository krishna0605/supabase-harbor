"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { SecurityNote } from "@/components/feedback/security-note";
import { api } from "@/shared/api-client";

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await api("/api/vault/setup", {
        method: "POST",
        body: JSON.stringify({
          password: form.get("password"),
          confirmation: form.get("confirmation"),
        }),
        interaction: true,
      });
      router.replace("/accounts");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-main">
          <Brand />
          <h1 className="auth-title">Create your local vault</h1>
          <p className="auth-copy">
            Choose a master password to protect every connected Supabase token.
            It cannot be recovered if forgotten.
          </p>
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">Master password</label>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                minLength={12}
                autoComplete="new-password"
                required
                autoFocus
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
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="inline-error">{error}</p> : null}
            <button
              className="button button-primary full-width"
              disabled={pending}
            >
              {pending ? "Creating vault…" : "Create vault"}
            </button>
          </form>
        </section>
        <SecurityNote />
      </div>
    </div>
  );
}
