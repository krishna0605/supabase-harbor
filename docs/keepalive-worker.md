# Keepalive worker operations

Harbor’s keepalive engine schedules one logical heartbeat every 24 hours with a
stable project-specific jitter of up to two hours. A short-lived sweep runs every
15 minutes, processes at most 25 claimed jobs with concurrency five, and exits.

## Durable states

`keepalive_enrollments` stores encrypted configuration and aggregate state.
`keepalive_jobs` stores pending, leased, retrying, terminal, and cancelled work.
`keepalive_attempts` is immutable, sanitized audit history.

Unique schedule slots prevent duplicate logical jobs. Claims use
`FOR UPDATE SKIP LOCKED`; a worker must present the exact lease token to complete or
fail a job. A running job becomes reclaimable after its 120-second lease expires.

Retries occur after 15 minutes, one hour, and six hours. Network failures, timeouts,
rate limits, and retryable upstream failures remain durable. Missing RPCs, disabled
Data APIs, removed projects, disabled accounts/enrollments, and confirmed credential
rejection are terminal after the allowed credential refresh.

## Railway contract

`railway.worker.json` defines:

- build-time TypeScript verification
- `npm run worker:sweep`
- cron `*/15 * * * *` in UTC
- restart policy `NEVER`
- no domain and no health endpoint

Required secrets are `WORKER_DATABASE_URL`, the current Harbor master key and
version, and—only during rotation—the previous key and version. Optional limits are
documented in `.env.example`.

The database login behind `WORKER_DATABASE_URL` must be a narrowly managed role that
can `SET ROLE harbor_worker`. The effective worker role owns no schema, has no DDL,
and can execute only reviewed functions in the private `harbor_internal` schema.

## Recovery

- If a process exits mid-request, wait for the lease to expire; the next sweep
  reclaims it.
- If a manually entered project key is revoked, reconnect it in Harbor.
- If an automatically discovered key is rejected, the worker performs one
  Management API rediscovery using the encrypted account PAT.
- Disable an enrollment to cancel pending work without changing Supabase.
- Removing an enrollment deletes only Harbor data. Optional SQL cleanup remains a
  deliberate user-run action in Supabase Studio.

Completed, failed, and cancelled job history is retained for 90 days. Sanitized
worker sweep telemetry is retained for 30 days. Each sweep also removes expired
private rate-limit buckets. Harbor reports a completed sweep within 45 minutes as
healthy; older telemetry is delayed.
