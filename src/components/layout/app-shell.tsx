"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  FolderKanban,
  LockKeyhole,
  Settings,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { api } from "@/shared/api-client";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: FolderKanban },
  { href: "/accounts", label: "Accounts", icon: UsersRound },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function lock() {
    await api("/api/vault/lock", { method: "POST", interaction: true });
    router.replace("/unlock");
  }

  const navigation = links.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      className={`nav-link ${pathname === href ? "active" : ""}`}
      aria-current={pathname === href ? "page" : undefined}
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
      </div>
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          <nav className="sidebar-nav" aria-label="Primary navigation">
            {navigation}
          </nav>
          <div className="sidebar-footer">
            <div className="local-chip">
              <span className="local-dot" />
              Loopback only
            </div>
            <button className="button button-quiet full-width" onClick={lock}>
              <LockKeyhole size={16} />
              Lock Harbor
            </button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
