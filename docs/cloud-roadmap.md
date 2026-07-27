# Cloud roadmap

The local edition cannot be made safe for public hosting by changing only its host
binding. Its process-memory vault and single-user session model
are deliberate local security boundaries.

## Proposed hosted architecture

```mermaid
flowchart LR
  Browser["Browser"] --> Web["Next.js on Vercel"]
  Web --> Proxy["Same-origin API proxy"]
  Proxy --> API["Railway API"]
  API --> DB["Neon Postgres"]
  API --> KMS["Managed KMS"]
  API --> OAuth["Supabase Management OAuth"]
  Worker["Railway worker"] --> DB
  Worker --> KMS
  Worker --> OAuth
```

## Required changes

1. Split browser UI, API, worker, and shared domain packages.
2. Add hosted Harbor authentication with secure database-backed sessions.
3. Add non-null tenant ownership and row-level isolation to every existing PostgreSQL
   table.
4. Replace PAT-first onboarding with Supabase Management OAuth using PKCE and state.
5. Store encrypted access and refresh tokens using envelope encryption and managed
   key wrapping.
6. Add server-side ownership enforcement, database RLS, rate limiting, and audit
   trails.
7. Run refresh and restore reconciliation through durable background jobs.
8. Isolate development, staging, preview, and production environments.
9. Complete cross-tenant, OAuth, key-rotation, recovery, and abuse testing.

Cloud work should be delivered as a separate milestone and threat model. Until that
work is complete, public deployment is unsupported.
