# Security Policy

Supabase Harbor handles credentials with significant account privileges.

## Supported versions

| Version                      | Supported |
| ---------------------------- | --------- |
| `0.1.x`                      | Yes       |
| Older or unreleased branches | No        |

## Reporting a vulnerability

Use GitHub’s private vulnerability-reporting feature:

1. Open the repository’s **Security** tab.
2. Select **Report a vulnerability**.
3. Include the affected version, reproduction steps, impact, and a minimal proof of
   concept.

Do not open a public issue for an unpatched vulnerability. Never include a real PAT,
database URL/export, root key, DEK, cookie secret, session cookie, provider token, or
private user data.

## Security boundary

Harbor authenticates through GitHub and Managed Neon Auth, then applies a default-deny
numeric GitHub-ID allowlist. All Harbor data carries non-null tenant ownership and is
protected by explicit ownership predicates plus forced PostgreSQL RLS.

Each user DEK is wrapped with a server-held root key. Encryption protects a copied
database from someone who lacks that key. It does not protect against a compromised
hosting operator or runtime. Anyone with both database access and
`HARBOR_MASTER_KEY` can decrypt all Harbor PATs.

Phase 5’s hosted controls are implemented locally, but public hosting remains
unsupported until the reviewed production migration, staging validation, OAuth
configuration, deployment, and live security gates are complete. Follow the
[production deployment runbook](docs/production-deployment.md).

## Suspected credential exposure

1. Revoke the affected PAT in Supabase immediately.
2. Rotate the deployment root/cookie/database credentials as applicable.
3. Revoke managed-auth sessions.
4. Preserve only redacted diagnostics.
5. Reconnect with a newly scoped disposable token before resuming use.
