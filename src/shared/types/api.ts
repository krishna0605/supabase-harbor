export type ApiSuccess<T> = {
  data: T;
  meta: {
    requestId: string;
    generatedAt: string;
    stale?: boolean;
  };
};

export type ApiFailure = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    accountId?: string;
    projectRef?: string;
  };
  meta: { requestId: string };
};

export type ProjectLifecycleStatus =
  "active" | "paused" | "transitioning" | "failed" | "removed" | "unknown";

export type ProjectHealthStatus = "healthy" | "unhealthy" | "unknown";
