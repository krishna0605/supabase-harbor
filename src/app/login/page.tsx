"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole, Mail, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { SecurityNote } from "@/components/feedback/security-note";
import { authClient } from "@/shared/auth-client";

type AuthMode = "sign-in" | "sign-up";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            name: name.trim(),
            email: normalizedEmail,
            password,
          })
        : await authClient.signIn.email({
            email: normalizedEmail,
            password,
          });

    if (result.error) {
      setError(
        result.error.message ??
          (mode === "sign-up"
            ? "Account creation failed."
            : "Email sign-in failed."),
      );
      setPending(false);
      return;
    }

    window.location.assign("/dashboard");
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-main">
          <Brand />
          <p className="eyebrow" style={{ marginTop: 28 }}>
            Private access
          </p>
          <h1 className="auth-title" style={{ marginTop: 0 }}>
            {mode === "sign-in" ? "Sign in to your Harbor" : "Create your Harbor account"}
          </h1>
          <p className="auth-copy">
            Use an approved email address and password. Your Supabase
            credentials remain encrypted and isolated inside your Harbor
            tenant.
          </p>

          <div className="segmented-control" style={{ marginTop: 24 }}>
            <button
              type="button"
              className={mode === "sign-in" ? "active" : ""}
              aria-pressed={mode === "sign-in"}
              onClick={() => changeMode("sign-in")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "sign-up" ? "active" : ""}
              aria-pressed={mode === "sign-up"}
              onClick={() => changeMode("sign-up")}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} style={{ marginTop: 24 }}>
            {mode === "sign-up" ? (
              <label className="field">
                <span>
                  <UserRound size={15} aria-hidden="true" /> Display name
                </span>
                <input
                  className="input"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
            ) : null}

            <label className="field" style={{ marginTop: mode === "sign-up" ? 16 : 0 }}>
              <span>
                <Mail size={15} aria-hidden="true" /> Email address
              </span>
              <input
                className="input"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="field" style={{ marginTop: 16 }}>
              <span>
                <LockKeyhole size={15} aria-hidden="true" /> Password
              </span>
              <input
                className="input"
                type="password"
                name="password"
                autoComplete={
                  mode === "sign-up" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            <button
              className="button button-primary full-width"
              style={{ marginTop: 24 }}
              disabled={pending}
              type="submit"
            >
              <LockKeyhole size={18} />
              {pending
                ? mode === "sign-up"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "sign-up"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {error ? (
            <p className="inline-error" style={{ marginTop: 12 }}>
              {error}
            </p>
          ) : null}
          <p className="auth-copy" style={{ marginTop: 18, fontSize: 12 }}>
            Access remains default-deny. The deployment operator must add your
            email address to Harbor’s server-side allowlist.
          </p>
        </section>
        <SecurityNote />
      </div>
    </div>
  );
}
