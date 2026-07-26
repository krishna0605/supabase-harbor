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

  /**
   * Keepalive fields. Optional until the engine lands — the dashboard treats a
   * missing value as "not enrolled", which is the truthful reading today.
   */
  keepaliveEnrolled?: boolean;
  keepaliveLastSuccessAt?: string | null;
  keepaliveLastErrorCode?: string | null;

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
