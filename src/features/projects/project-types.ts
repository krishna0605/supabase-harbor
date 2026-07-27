export type ProjectServiceHealth = {
  name: string;
  healthy: boolean;
  status: string;
  version?: string | null;
  checkedAt: string;
};

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
    | "active"
    | "paused"
    | "transitioning"
    | "failed"
    | "removed"
    | "unknown";
  healthStatus: "healthy" | "unhealthy" | "unknown";
  lastSeenAt: string;
  accountLabel: string;
  accountEmail: string;
  accountLastSuccessfulSyncAt?: string | null;
  accountLastErrorCode?: string | null;

  keepaliveEnrolled: boolean;
  keepaliveEnabled: boolean | null;
  keepaliveLastAttemptAt: string | null;
  keepaliveLastSuccessAt: string | null;
  keepaliveLastErrorCode: string | null;
  keepaliveNeedsAttention: boolean | null;

  /** Per-service health, populated by the health sweep. */
  services?: ProjectServiceHealth[];
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
