"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DashboardProject } from "@/features/projects/project-types";
import { protectionOf } from "@/features/keepalive/protection-state";

export type SortKey =
  | "name"
  | "account"
  | "status"
  | "protection"
  | "margin"
  | "ping";

export type RiskFilter =
  | "all"
  | "protected"
  | "at-risk"
  | "paused"
  | "unprotected";

/** Lowest margin first — the project closest to running aground leads. */
const PROTECTION_ORDER = {
  "at-risk": 0,
  slipping: 1,
  unprotected: 2,
  protected: 3,
} as const;

const LIFECYCLE_ORDER = {
  failed: 0,
  paused: 1,
  transitioning: 2,
  unknown: 3,
  active: 4,
  removed: 5,
} as const;

/**
 * Filter and sort state lives in the URL so a view survives a reload and can be
 * pasted to someone else. Everything here is derived — there is no local copy
 * to drift out of step.
 */
export function useProjectFilters(projects: DashboardProject[], now: number) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const search = params.get("q") ?? "";
  const account = params.get("account") ?? "";
  const organization = params.get("org") ?? "";
  const risk = (params.get("risk") ?? "all") as RiskFilter;
  const sort = (params.get("sort") ?? "margin") as SortKey;
  const direction: "asc" | "desc" =
    params.get("dir") === "desc" ? "desc" : "asc";

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sort === key) {
        setParam({ dir: direction === "asc" ? "desc" : null });
        return;
      }
      setParam({ sort: key, dir: null });
    },
    [direction, setParam, sort],
  );

  const decorated = useMemo(
    () =>
      projects.map((project) => ({
        project,
        protection: protectionOf(
          {
            enrolled: Boolean(project.keepaliveEnrolled),
            lastSuccessAt: project.keepaliveLastSuccessAt ?? null,
            paused: project.lifecycleStatus === "paused",
          },
          now,
        ),
      })),
    [projects, now],
  );

  const counts = useMemo(() => {
    let protectedCount = 0;
    let atRisk = 0;
    let paused = 0;
    let unprotected = 0;

    for (const { project, protection } of decorated) {
      if (protection.state === "protected") protectedCount += 1;
      if (protection.state === "at-risk" || protection.state === "slipping") {
        atRisk += 1;
      }
      if (protection.state === "unprotected") unprotected += 1;
      if (project.lifecycleStatus === "paused") paused += 1;
    }

    return {
      total: decorated.length,
      protected: protectedCount,
      atRisk,
      paused,
      unprotected,
    };
  }, [decorated]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = decorated.filter(({ project, protection }) => {
      if (
        query &&
        !project.name.toLowerCase().includes(query) &&
        !project.projectRef.toLowerCase().includes(query)
      ) {
        return false;
      }
      if (account && project.accountLabel !== account) return false;
      if (organization && project.organizationName !== organization) {
        return false;
      }
      if (risk === "protected" && protection.state !== "protected") return false;
      if (
        risk === "at-risk" &&
        protection.state !== "at-risk" &&
        protection.state !== "slipping"
      ) {
        return false;
      }
      if (risk === "paused" && project.lifecycleStatus !== "paused") {
        return false;
      }
      if (risk === "unprotected" && protection.state !== "unprotected") {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const result = compare(a, b, sort);
      return direction === "desc" ? -result : result;
    });

    return sorted;
  }, [decorated, search, account, organization, risk, sort, direction]);

  const accountOptions = useMemo(
    () => [...new Set(projects.map((p) => p.accountLabel))].sort(),
    [projects],
  );

  const organizationOptions = useMemo(
    () => [...new Set(projects.map((p) => p.organizationName))].sort(),
    [projects],
  );

  return {
    search,
    account,
    organization,
    risk,
    sort,
    direction,
    setParam,
    toggleSort,
    visible,
    counts,
    accountOptions,
    organizationOptions,
    hasFilters: Boolean(search || account || organization || risk !== "all"),
  };
}

type Row = { project: DashboardProject; protection: { state: string; marginDays: number } };

function compare(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "name":
      return a.project.name.localeCompare(b.project.name);
    case "account":
      return a.project.accountLabel.localeCompare(b.project.accountLabel);
    case "status":
      return (
        LIFECYCLE_ORDER[a.project.lifecycleStatus] -
        LIFECYCLE_ORDER[b.project.lifecycleStatus]
      );
    case "protection":
      return (
        PROTECTION_ORDER[a.protection.state as keyof typeof PROTECTION_ORDER] -
        PROTECTION_ORDER[b.protection.state as keyof typeof PROTECTION_ORDER]
      );
    case "ping":
      return (
        Date.parse(b.project.keepaliveLastSuccessAt ?? "0") -
        Date.parse(a.project.keepaliveLastSuccessAt ?? "0")
      );
    case "margin":
    default:
      // Default view: whoever runs aground first sits at the top.
      return a.protection.marginDays - b.protection.marginDays;
  }
}
