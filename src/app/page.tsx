"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Anchor } from "lucide-react";
import { api } from "@/shared/api-client";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<{ state: "uninitialized" | "locked" | "unlocked" }>("/api/vault/status")
      .then(({ state }) =>
        router.replace(
          state === "uninitialized"
            ? "/setup"
            : state === "locked"
              ? "/unlock"
              : "/dashboard",
        ),
      )
      .catch(() => router.replace("/unlock"));
  }, [router]);
  return (
    <div className="auth-page" role="status">
      <div style={{ textAlign: "center", color: "var(--muted)" }}>
        <Anchor
          size={28}
          style={{ margin: "0 auto 10px", color: "var(--teal)" }}
        />
        Opening Harbor…
      </div>
    </div>
  );
}
