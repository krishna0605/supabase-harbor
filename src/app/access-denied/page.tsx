import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Brand } from "@/components/brand";

export default function AccessDeniedPage() {
  return (
    <div className="auth-page">
      <section className="auth-main panel" style={{ width: "min(520px, 100%)" }}>
        <Brand />
        <ShieldX
          size={28}
          style={{ color: "var(--flare)", marginTop: 28 }}
        />
        <h1 className="auth-title">This GitHub account is not approved</h1>
        <p className="auth-copy">
          Authentication succeeded, but Harbor did not create a tenant, vault,
          or any application data for this identity. Ask the deployment
          operator to add your numeric GitHub ID to the allowlist.
        </p>
        <Link
          href="/login"
          className="button button-secondary"
          style={{ marginTop: 24 }}
        >
          Return to sign in
        </Link>
      </section>
    </div>
  );
}
