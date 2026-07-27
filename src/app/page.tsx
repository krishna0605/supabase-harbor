"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Anchor } from "lucide-react";
import { api } from "@/shared/api-client";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api("/api/me")
      .then(() => router.replace("/dashboard"))
      .catch((error: Error & { code?: string }) =>
        router.replace(
          error.code === "ACCESS_NOT_ALLOWED" ? "/access-denied" : "/login",
        ),
      );
  }, [router]);

  return (
    <div className="auth-page" role="status">
      <div style={{ textAlign: "center", color: "var(--muted)" }}>
        <Anchor
          size={28}
          style={{ margin: "0 auto 10px", color: "var(--verdigris)" }}
        />
        Opening Harbor…
      </div>
    </div>
  );
}
