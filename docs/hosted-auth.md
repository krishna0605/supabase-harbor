# Hosted authentication

Harbor uses Managed Neon Auth with email and password credentials.

## Admission

Authentication and Harbor admission are separate:

1. Neon Auth validates the user's email and password.
2. Harbor normalizes the authenticated email address.
3. `HARBOR_ALLOWED_EMAILS` is checked with default-deny behavior.
4. Only an approved identity receives a Harbor tenant, user vault, and defaults.

The allowlist cannot be empty or contain `*`. Removing an email denies Harbor access on
the next authorization check. Neon Auth may retain an identity record for a denied
user, but Harbor creates no tenant-owned rows for that identity.

## Sessions and CSRF

Neon Auth owns database-backed sessions and signed session caching. Harbor issues a
separate signed `harbor_csrf` cookie after `GET /api/me`. The browser mirrors that
value into `X-Harbor-CSRF`; the server verifies its signature and managed session ID.
The CSRF token is never stored in localStorage.

## Authentication methods

Production enables email sign-up and sign-in only. OAuth providers, anonymous
accounts, magic links, and localhost redirects remain disabled.

## Branch isolation

Managed Neon Auth is provisioned separately on production and test branches. Auth
URLs, cookie secrets, root keys, allowlists, and database URLs are branch-specific
deployment secrets.
