# Security Policy

Supabase Harbor handles credentials with significant account privileges. Security
reports are taken seriously.

## Supported versions

| Version                      | Supported |
| ---------------------------- | --------- |
| `0.1.x`                      | Yes       |
| Older or unreleased branches | No        |

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting feature for this repository:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include the affected version, reproduction steps, impact, and a minimal proof of
   concept.

Do not open a public issue for an unpatched vulnerability. Never include a real
Supabase PAT, master password, Neon connection string, database export, encryption
key, session cookie, or private customer data in a report.

You should receive an acknowledgement within seven days. We will coordinate
validation, remediation, disclosure timing, and credit through the private report.

## Security boundary

The `0.1.x` line is a local Windows application bound to `127.0.0.1`. It is not
supported behind a public reverse proxy, tunnel, container port, LAN listener, or
cloud hosting platform.

Envelope encryption protects PATs stored in Neon. It does not defend
against malware, administrator-level access, process-memory inspection, or a
compromised browser running under the same Windows account.

## Handling suspected credential exposure

If a real token may have been exposed:

1. Revoke the PAT in Supabase immediately.
2. Lock Harbor and stop the process.
3. Preserve relevant redacted diagnostics.
4. Rotate credentials and reconnect with a newly scoped token.
