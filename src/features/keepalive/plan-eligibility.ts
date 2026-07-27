const FREE_OR_UNKNOWN = new Set(["", "free", "unknown"]);

export function isKnownPaidPlan(plan: string | null | undefined) {
  return !FREE_OR_UNKNOWN.has((plan ?? "unknown").trim().toLowerCase());
}
