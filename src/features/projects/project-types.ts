export type DashboardProject = {
  accountId: string;
  projectRef: string;
  name: string;
  organizationId: string;
  organizationName: string;
  organizationPlan: string;
  region: string;
  cloudProvider: string;
  rawStatus: string;
  lifecycleStatus:
    "active" | "paused" | "transitioning" | "failed" | "removed" | "unknown";
  healthStatus: "healthy" | "unhealthy" | "unknown";
  lastSeenAt: string;
  accountLabel: string;
  accountEmail: string;
  accountLastSuccessfulSyncAt?: string | null;
  accountLastErrorCode?: string | null;
};

export type HarborAccount = {
  id: string;
  label: string;
  primaryEmail: string;
  enabled: boolean;
  lastSuccessfulSyncAt?: string | null;
  lastErrorCode?: string | null;
  createdAt: string;
};
