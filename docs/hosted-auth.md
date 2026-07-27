# Hosted authentication

Harbor uses Managed Neon Auth with GitHub as its only supported provider.

## Admission

Authentication and Harbor admission are separate:

1. GitHub authenticates the user through Neon Auth.
2. Harbor resolves the linked numeric GitHub account ID.
3. `HARBOR_ALLOWED_GITHUB_IDS` is checked with default-deny behavior.
4. Only an approved identity receives a Harbor tenant, user vault, and defaults.

The allowlist cannot be empty or contain `*`. Removing an ID denies Harbor access on
the next authorization check. Neon Auth may retain an identity record for a denied
user, but Harbor creates no tenant-owned rows for that identity.

## Sessions and CSRF

Neon Auth owns database-backed sessions and signed session caching. Harbor issues a
separate signed `harbor_csrf` cookie after `GET /api/me`. The browser mirrors that
value into `X-Harbor-CSRF`; the server verifies its signature and managed session ID.
The CSRF token is never stored in localStorage.

## Provider scopes

Harbor needs GitHub identity and email only. Repository, organization, code,
administration, and workflow scopes are forbidden.

## Branch isolation

Managed Neon Auth is provisioned separately on production and test branches. Auth
URLs, cookie secrets, root keys, allowlists, and database URLs are branch-specific
deployment secrets.
