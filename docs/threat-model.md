# Threat model

## Protected assets

- Supabase Personal Access Tokens
- `HARBOR_MASTER_KEY` and previous rotation key
- User Data Encryption Keys
- Neon database and Managed Neon Auth credentials
- Managed-auth sessions and GitHub provider tokens
- Account, project, activity, and preference data
- Encrypted keepalive publishable/legacy anon keys and worker leases

## Trust boundaries

The browser is untrusted for secrets. It receives sanitized metadata and a readable,
session-bound CSRF token, but no PAT, ciphertext, root key, DEK, database URL, or
provider token.

The hosting runtime is trusted. Anyone who controls the runtime or obtains both the
database and `HARBOR_MASTER_KEY` can decrypt every Harbor PAT. Envelope encryption
protects copied database data only when the root key remains separate.

Managed Neon Auth is trusted to validate GitHub sessions. Harbor separately enforces
the numeric GitHub-ID allowlist; an authenticated but unapproved identity receives no
tenant, user vault, settings, account, project, or activity rows.

## Controls

- GitHub OAuth only; no repository, organization, or code scopes
- Default-deny numeric GitHub-ID allowlist
- Database-backed managed sessions and secure production cookies
- Signed CSRF cookie bound to the managed session ID
- Exact Host and Origin validation plus Fetch Metadata checks
- One random 32-byte DEK per user
- Versioned AES-256-GCM root-key wrapping
- Independent PAT envelopes with unique nonces and user/account AAD
- Independent keepalive-key envelopes with user/account/project AAD
- Tenant-local HMAC-SHA-256 fingerprints
- Non-null `user_id` ownership and tenant-leading indexes
- Forced RLS on every Harbor tenant table
- `harbor_runtime` has DML only, no DDL, superuser, or `BYPASSRLS`
- Structured redaction for authorization, cookies, tokens, keys, and request bodies
- Durable per-operation rate limits keyed by HMAC-digested actor identifiers; raw IP
  addresses are not stored
- Fixed Supabase RPC hosts derived from 20-character project references, disabled redirects,
  and ten-second timeouts
- Private worker functions, exact lease tokens, and a no-DDL/no-`BYPASSRLS` worker role
- Sanitized sweep telemetry without tenant IDs, credentials, lease tokens, or
  upstream response bodies
- Production CSP, frame denial, restrictive browser permissions, and HSTS on HTTPS

## Explicit non-goals

Harbor cannot defend against a compromised deployment operator, hosting account,
server runtime, dependency, browser session, or user device. Best-effort buffer
wiping cannot guarantee removal from managed-runtime memory.

The only Supabase Management API write remains project restore. Keepalive uses the
project Data API to call only `harbor_ping()`. Deleting an account, tenant, or
keepalive enrollment never invokes a Supabase deletion endpoint or executes cleanup
SQL.
