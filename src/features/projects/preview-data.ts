import type { DashboardProject } from "@/features/projects/project-types";

/**
 * Representative data for the development-only visual route
 * (`/dashboard?preview=1`). Never returned by a production API.
 *
 * Timestamps are relative to load so the preview keeps exercising the full
 * range of protection states — protected, slipping, at risk, unprotected —
 * however long after it was written someone opens it.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Timestamps are derived from a caller-supplied clock rather than Date.now() at
 * module scope. Module scope evaluates once on the server and again on the
 * client, producing different values and a hydration mismatch. Routing through
 * the same store-backed clock the table uses keeps both renders identical.
 */
export const PREVIEW_EPOCH = Date.parse("2026-07-26T12:00:00.000Z");

const makeAt = (now: number) => (msAgo: number) =>
  new Date(now - msAgo).toISOString();

const ACCOUNTS = {
  Founder: { id: "preview-a", email: "founder@example.com" },
  Studio: { id: "preview-b", email: "studio@example.com" },
  Personal: { id: "preview-c", email: "me@example.com" },
} as const;

type AccountName = keyof typeof ACCOUNTS;

type Seed = {
  name: string;
  ref: string;
  account: AccountName;
  org: string;
  region: string;
  rawStatus: string;
  lifecycle: DashboardProject["lifecycleStatus"];
  health: DashboardProject["healthStatus"];
  /** Hours since the last successful keepalive ping; null means not enrolled. */
  pingedHoursAgo: number | null;
  syncedHoursAgo?: number;
  errorCode?: string;
  services?: "ok" | "degraded";
};

type At = (msAgo: number) => string;

const servicesOk = (at: At): DashboardProject["services"] => [
  { name: "auth", healthy: true, status: "ACTIVE_HEALTHY", version: "2.180.0", checkedAt: at(HOUR) },
  { name: "db", healthy: true, status: "ACTIVE_HEALTHY", version: "15.8", checkedAt: at(HOUR) },
  { name: "pooler", healthy: true, status: "ACTIVE_HEALTHY", version: null, checkedAt: at(HOUR) },
  { name: "realtime", healthy: true, status: "ACTIVE_HEALTHY", version: "2.34.7", checkedAt: at(HOUR) },
  { name: "rest", healthy: true, status: "ACTIVE_HEALTHY", version: "12.2.3", checkedAt: at(HOUR) },
  { name: "storage", healthy: true, status: "ACTIVE_HEALTHY", version: "1.19.3", checkedAt: at(HOUR) },
];

const servicesDegraded = (at: At): DashboardProject["services"] => [
  { name: "auth", healthy: true, status: "ACTIVE_HEALTHY", version: "2.180.0", checkedAt: at(HOUR) },
  { name: "db", healthy: true, status: "ACTIVE_HEALTHY", version: "15.8", checkedAt: at(HOUR) },
  { name: "pooler", healthy: false, status: "UNHEALTHY", version: null, checkedAt: at(HOUR) },
  { name: "realtime", healthy: false, status: "TIMEOUT", version: "2.34.7", checkedAt: at(HOUR) },
  { name: "rest", healthy: true, status: "ACTIVE_HEALTHY", version: "12.2.3", checkedAt: at(HOUR) },
  { name: "storage", healthy: true, status: "ACTIVE_HEALTHY", version: "1.19.3", checkedAt: at(HOUR) },
];

const SEEDS: Seed[] = [
  // At risk — paused despite enrollment. Leads the default sort.
  {
    name: "Dockyard Data",
    ref: "dockyard-data",
    account: "Studio",
    org: "Shipyard Studio",
    region: "Central EU (Frankfurt)",
    rawStatus: "INACTIVE",
    lifecycle: "paused",
    health: "unknown",
    pingedHoursAgo: 7 * 24,
    errorCode: "SUPABASE_OFFLINE",
  },
  // At risk — keepalive failing for six days, not yet paused.
  {
    name: "Keel Sandbox",
    ref: "keel-sandbox",
    account: "Personal",
    org: "Personal",
    region: "South Asia (Mumbai)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 6 * 24 + 4,
    services: "ok",
  },
  // Paused, never enrolled — the case Harbor exists to stop happening.
  {
    name: "Atlas Staging",
    ref: "atlas-staging",
    account: "Studio",
    org: "Shipyard Studio",
    region: "Central EU (Frankfurt)",
    rawStatus: "INACTIVE",
    lifecycle: "paused",
    health: "unknown",
    pingedHoursAgo: null,
  },
  // Slipping.
  {
    name: "Ember Notes",
    ref: "ember-notes",
    account: "Personal",
    org: "Personal",
    region: "South Asia (Mumbai)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 4 * 24,
    services: "ok",
  },
  // Slipping and degraded — two independent axes at once.
  {
    name: "Beacon API",
    ref: "beacon-api",
    account: "Founder",
    org: "Northstar Labs",
    region: "Southeast Asia (Singapore)",
    rawStatus: "ACTIVE_UNHEALTHY",
    lifecycle: "active",
    health: "unhealthy",
    pingedHoursAgo: 3 * 24 + 6,
    services: "degraded",
  },
  // Mid-restore.
  {
    name: "Canvas Web",
    ref: "canvas-web",
    account: "Personal",
    org: "Personal",
    region: "West US (Oregon)",
    rawStatus: "RESTORING",
    lifecycle: "transitioning",
    health: "unknown",
    pingedHoursAgo: 2 * 24,
  },
  // Unprotected but healthy — quietly on a seven-day clock.
  {
    name: "Fjord Analytics",
    ref: "fjord-analytics",
    account: "Founder",
    org: "Northstar Labs",
    region: "East US (North Virginia)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: null,
    services: "ok",
  },
  {
    name: "Grove CRM",
    ref: "grove-crm",
    account: "Personal",
    org: "Personal",
    region: "West EU (London)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: null,
  },
  {
    name: "Iris Mobile",
    ref: "iris-mobile",
    account: "Founder",
    org: "Northstar Labs",
    region: "West EU (London)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: null,
  },
  // Protected.
  {
    name: "Aether Production",
    ref: "aether-prod",
    account: "Founder",
    org: "Northstar Labs",
    region: "East US (North Virginia)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 6,
    services: "ok",
  },
  {
    name: "Harbor Docs",
    ref: "harbor-docs",
    account: "Studio",
    org: "Shipyard Studio",
    region: "West EU (London)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 11,
    services: "ok",
  },
  {
    name: "Juniper Queue",
    ref: "juniper-queue",
    account: "Personal",
    org: "Personal",
    region: "East US (North Virginia)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 20,
  },
  {
    name: "Lantern Search",
    ref: "lantern-search",
    account: "Founder",
    org: "Northstar Labs",
    region: "Southeast Asia (Singapore)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 33,
  },
  {
    name: "Mariner Jobs",
    ref: "mariner-jobs",
    account: "Studio",
    org: "Shipyard Studio",
    region: "Central EU (Frankfurt)",
    rawStatus: "ACTIVE_HEALTHY",
    lifecycle: "active",
    health: "healthy",
    pingedHoursAgo: 41,
  },
];

/**
 * Build the fixture against a supplied clock.
 *
 * Pass the *same* clock value used to grade protection. The fixture's
 * timestamps are offsets from it, so if the two diverge every project reads as
 * freshly pinged — the fixture would be describing one moment and the grader
 * measuring against another.
 */
export function previewProjectsAt(now: number): DashboardProject[] {
  const at = makeAt(now);

  return SEEDS.map((seed) => ({
    accountId: ACCOUNTS[seed.account].id,
    projectRef: seed.ref,
    name: seed.name,
    organizationId: seed.org.toLowerCase().replaceAll(" ", "-"),
    organizationName: seed.org,
    organizationPlan: "Free",
    region: seed.region,
    cloudProvider: "AWS",
    rawStatus: seed.rawStatus,
    lifecycleStatus: seed.lifecycle,
    healthStatus: seed.health,
    lastSeenAt: at(HOUR),
    accountLabel: seed.account,
    accountEmail: ACCOUNTS[seed.account].email,
    accountLastSuccessfulSyncAt: at((seed.syncedHoursAgo ?? 1) * HOUR),
    accountLastErrorCode: seed.errorCode ?? null,
    keepaliveEnrolled: seed.pingedHoursAgo !== null,
    keepaliveLastSuccessAt:
      seed.pingedHoursAgo === null ? null : at(seed.pingedHoursAgo * HOUR),
    keepaliveLastErrorCode: seed.errorCode ?? null,
    services:
      seed.services === "ok"
        ? servicesOk(at)
        : seed.services === "degraded"
          ? servicesDegraded(at)
          : undefined,
  }));
}

export const PREVIEW_DAY = DAY;
