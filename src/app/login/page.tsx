"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";
import { Brand } from "@/components/brand";
import { SecurityNote } from "@/components/feedback/security-note";
import { authClient } from "@/shared/auth-client";

export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    });
    if (result.error) {
      setError(result.error.message ?? "GitHub sign-in failed.");
      setPending(false);
    }
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
            Sign in to your Harbor
          </h1>
          <p className="auth-copy">
            Continue with an approved GitHub account. Harbor requests identity
            and email access only—it never asks for repository or code access.
          </p>
          <button
            className="button button-primary full-width"
            style={{ marginTop: 28 }}
            disabled={pending}
            onClick={signIn}
          >
            <GitBranch size={18} />
            {pending ? "Opening GitHub…" : "Continue with GitHub"}
          </button>
          {error ? (
            <p className="inline-error" style={{ marginTop: 12 }}>
              {error}
            </p>
          ) : null}
          <p className="auth-copy" style={{ marginTop: 18, fontSize: 12 }}>
            Access is default-deny. Your deployment operator must add your
            numeric GitHub ID to Harbor’s server-side allowlist.
          </p>
        </section>
        <SecurityNote />
      </div>
    </div>
  );
}
