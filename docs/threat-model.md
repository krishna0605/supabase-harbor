# Threat model

## Protected assets

- Supabase Personal Access Tokens
- The vault Data Encryption Key
- Account and project metadata
- Local activity and settings

## Controls

- scrypt-derived KEK with `N=131072`, `r=8`, and `p=1`
- Random 32-byte DEK wrapped with AES-256-GCM
- Independent token envelopes with unique 12-byte nonces
- HMAC-SHA-256 token fingerprints for duplicate detection
- HttpOnly, SameSite=Strict session cookie and separate CSRF token
- In-memory-only sessions and DEK, cleared on lock and process shutdown
- Loopback-only binding plus Host, Origin, CSP, and permission-policy checks
- Structured log redaction for authorization, tokens, cookies, encryption fields, and
  request bodies

## Explicit non-goals

Harbor cannot defend against malware or an administrator inspecting the running
process, a compromised browser executing under the same Windows user, physical access
to an unlocked session, or a malicious dependency executing during installation.

The only supported upstream write is project restore. Local account removal and vault
reset never invoke Supabase deletion endpoints.
