export type KeepaliveEnrollment = {
  accountId: string;
  projectRef: string;
  enabled: boolean;
  credentialSource: "automatic" | "manual";
  credentialType: "publishable" | "legacy_anon";
  nextRunAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  consecutiveFailures: number;
  needsAttention: boolean;
};

export type KeepaliveJobSummary = {
  id: string;
  accountId: string;
  projectRef: string;
  trigger: "scheduled" | "manual" | "enrollment_validation";
  status:
    "pending" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";
  scheduledFor: string;
  attemptCount: number;
  lastErrorCode: string | null;
  completedAt: string | null;
};

export type KeepaliveAttemptSummary = {
  id: string;
  jobId: string;
  accountId: string;
  projectRef: string;
  attemptNumber: number;
  status: "succeeded" | "failed";
  errorCode: string | null;
  upstreamStatus: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
};

export type KeepaliveOverview = {
  enrollments: KeepaliveEnrollment[];
  jobs: KeepaliveJobSummary[];
  attempts: KeepaliveAttemptSummary[];
};
