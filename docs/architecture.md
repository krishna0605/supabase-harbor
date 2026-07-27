# Architecture

```mermaid
flowchart LR
  U["Approved GitHub user"] --> B["Harbor browser UI"]
  B --> N["Next.js UI and route handlers"]
  N --> A["Managed Neon Auth"]
  N --> G["Harbor tenant guard"]
  G --> C["Per-user AES-256-GCM envelopes"]
  G --> R["Restricted runtime role and forced RLS"]
  R --> D["Neon Postgres"]
  C --> M["Typed Management API adapter"]
  M --> SB["api.supabase.com"]
  N --> L["Redacted server log"]
```

Browser code receives sanitized identity, account, project, health, and activity
metadata. Database credentials, Supabase PATs, PAT ciphertext, root keys, user DEKs,
managed-auth cookies, and GitHub provider tokens remain server-side.

## Request boundary

1. Managed Neon Auth validates its database-backed session.
2. Harbor resolves the linked numeric GitHub provider ID.
3. The server-side allowlist admits or rejects the identity.
4. Only an approved user receives a tenant context.
5. Repository batches switch to `harbor_runtime`, set `harbor.user_id`, and execute
   explicit tenant predicates under forced RLS.
6. Secret operations unwrap the user DEK for one operation and wipe temporary key
   buffers best-effort.

Resource lookups include both the tenant and resource identifier. Cross-tenant IDs
return `404` to avoid confirming that another user’s resource exists.

## Persistence

Neon HTTP is used for request-scoped queries and atomic batches. Runtime traffic uses
the pooled connection; migrations use a direct connection. Every Harbor-owned table
is tenant-owned and protected by forced PostgreSQL RLS.

Account refreshes are bounded to three concurrent accounts. A failed refresh
preserves prior cache rows. Restore POSTs are never blindly retried; accepted actions
are reconciled by subsequent reads.

## Deployment state

Phase 3 supplies the hosted identity and data-security architecture but is not a
public release. The Railway worker, public Vercel/Railway topology, production secret
injection, monitoring, rate controls, and deployment verification remain later
phases.
