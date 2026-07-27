"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FolderKanban,
  LogOut,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { api } from "@/shared/api-client";
import { authClient } from "@/shared/auth-client";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: FolderKanban },
  { href: "/keepalive", label: "Keepalive", icon: ShieldCheck },
  { href: "/accounts", label: "Accounts", icon: UsersRound },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ name: string | null; email: string; image: string | null }>(
        "/api/me",
      ),
    retry: false,
  });

  useEffect(() => {
    const code = (me.error as (Error & { code?: string }) | null)?.code;
    if (code === "ACCESS_NOT_ALLOWED") router.replace("/access-denied");
    if (code === "AUTHENTICATION_REQUIRED") router.replace("/login");
  }, [me.error, router]);

  async function signOut() {
    await authClient.signOut();
    document.cookie = "harbor_csrf=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/login");
    router.refresh();
  }

  const navigation = links.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      className={`nav-link ${pathname === href ? "active" : ""}`}
      aria-current={pathname === href ? "page" : undefined}
      title={label}
    >
      <Icon size={17} />
      <span>{label}</span>
    </Link>
  ));

  return (
    <>
      <div className="mobile-bar">
        <Brand />
        <nav className="mobile-nav" aria-label="Primary navigation">
          {navigation}
        </nav>
        <span style={{ marginLeft: "auto" }}>
          <ThemeToggle />
        </span>
      </div>
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          <nav className="sidebar-nav" aria-label="Primary navigation">
            {navigation}
          </nav>
          <div className="sidebar-footer">
            <div className="local-chip" title={me.data?.email}>
              {me.data?.image ? (
                // GitHub controls this URL; the image is decorative here.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.data.image}
                  alt=""
                  width={20}
                  height={20}
                  style={{ borderRadius: "50%" }}
                />
              ) : (
                <span className="local-dot" />
              )}
              {me.data?.name ?? me.data?.email ?? "Signed in"}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="button button-quiet full-width"
                onClick={signOut}
              >
                <LogOut size={15} />
                Sign out
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
