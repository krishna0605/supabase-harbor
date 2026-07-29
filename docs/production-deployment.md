# Production deployment runbook

This runbook deploys Harbor as a private hosted service:

- the Next.js application runs on Vercel;
- scheduled keepalive sweeps run on Railway;
- tenant data, durable jobs, and security state live in Neon Postgres;
- Managed Neon Auth uses email/password sessions;
- Harbor admits only explicitly allowlisted email addresses.

The repository is public, but the hosted application is not open registration.
Never place a database URL, password, PAT, root key, cookie secret, or project key
in source control, a support ticket, chat, screenshot, or build argument.

## Release gates

Production activation is deliberately split into three approvals:

1. Approve the exact Neon production migration.
2. Approve promotion after staging passes.
3. Approve cleanup of recovery and validation branches after stabilization.

The committed `vercel.json` disables automatic Git deployments. Create deployments
from the exact verified commit in the Vercel dashboard. Railway should use **Wait for
CI** so a failed GitHub workflow cannot start a worker deployment.

## Deployment topology

| Component           | Staging                      | Production                   |
| ------------------- | ---------------------------- | ---------------------------- |
| Vercel project      | `supabase-harbor-staging`    | `supabase-harbor`            |
| Neon database       | test branch / `harbor_test`  | production branch / `neondb` |
| Neon Auth           | test-branch Auth             | production-branch Auth       |
| Railway environment | `staging`                    | `production`                 |
| Git source          | exact verified `main` commit | same staging-approved commit |
| Supabase data       | disposable only              | user-added after launch      |

Use independent database logins, cookie secrets, rate-limit keys,
and root encryption keys in staging and production.

## Secret inventory

### Vercel web application

Configure these as encrypted Vercel environment variables for **Production** only:

```text
DATABASE_URL
NEON_AUTH_BASE_URL
NEON_AUTH_COOKIE_SECRET
HARBOR_MASTER_KEY
HARBOR_MASTER_KEY_VERSION=1
HARBOR_RATE_LIMIT_KEY
HARBOR_ALLOWED_EMAILS=<comma-separated approved email addresses>
HARBOR_ORIGIN
HARBOR_RUNTIME_MODE=hosted
HARBOR_DEPLOYMENT_ENV
HARBOR_LOG_DESTINATION=stdout
HARBOR_LOG_LEVEL=info
```

Do not add `DATABASE_URL_UNPOOLED`, test database URLs, `WORKER_DATABASE_URL`, or a
previous root key to Vercel during the initial release.

### Railway worker

Configure these as Railway service variables:

```text
WORKER_DATABASE_URL
HARBOR_MASTER_KEY
HARBOR_MASTER_KEY_VERSION=1
HARBOR_RUNTIME_MODE=hosted
HARBOR_DEPLOYMENT_ENV
HARBOR_LOG_DESTINATION=stdout
HARBOR_LOG_LEVEL=info
KEEPALIVE_MAX_CONCURRENCY=5
KEEPALIVE_CLAIM_LIMIT=25
KEEPALIVE_SWEEP_TIMEOUT_MS=240000
```

The worker root key must match the corresponding Vercel environment. It receives no
Auth URL, Auth cookie secret, rate-limit key, web database login, or
Supabase credential.

## 1. Prepare the release commit

1. Confirm the current branch is `main` and the working tree is clean.
2. Run `npm ci`.
3. Run `npm run verify`.
4. Run `npm audit --omit=dev --audit-level=high`.
5. Search tracked content and Git history for connection-string prefixes, real token
   formats, and known secret fixtures.
6. Push the verified commits to `origin/main`.
7. Wait for both CI and CodeQL to succeed.
8. Copy the exact commit SHA; use that same SHA throughout staging.

Do not deploy an uncommitted directory or a different commit to either platform.

## 2. Activate the Neon schema

1. In Neon, create a timestamped branch from production named like
   `backup-pre-phase5-YYYYMMDD`.
2. Create a separate release-candidate branch from production.
3. Apply committed migrations `0001` through `0006` to the release-candidate branch
   with the unpooled owner connection.
4. Verify the tenant tables use forced RLS, private schemas are closed to `PUBLIC`,
   and the runtime/worker roles have no login, DDL, superuser, or `BYPASSRLS`.
5. Apply the same committed migration set to `harbor_test` and run the destructive
   integration suite there.
6. Compare the release-candidate schema with the committed schema and confirm zero
   drift.
7. Review and explicitly approve the production migration.
8. Apply exactly the reviewed migrations to production.
9. Create login credentials through Neon:
   - `harbor_web_login`, with membership only in `harbor_runtime`;
   - `harbor_worker_login`, with membership only in `harbor_worker`.
10. Use pooled TLS connection strings for both deployed services.
11. Keep the owner/unpooled credential outside Vercel and Railway.

Keep the backup branch until the seven-day stabilization review is complete.

## 3. Configure staging email authentication

1. Provision Managed Neon Auth on the persistent test branch.
2. Enable email sign-up and email sign-in.
3. Disable every OAuth provider, anonymous access, and localhost redirects.
4. Add only the exact stable staging Vercel origin to Neon Auth trusted domains.
5. Configure a staging-only email allowlist in Vercel.

## 4. Create the Vercel staging project

1. Open the Vercel dashboard and select the intended team.
2. Choose **Add New → Project**.
3. Import `krishna0605/supabase-harbor`.
4. Set the project name to `supabase-harbor-staging`.
5. Keep the root directory as the repository root and framework as Next.js.
6. Set Node.js to `24.x`; `vercel.json` pins `npm ci`, `npm run build`, and `iad1`.
7. Add the staging Vercel variables from the inventory above:
   - use the test web login’s pooled TLS URL;
   - set `HARBOR_ORIGIN` to the exact stable staging HTTPS origin;
   - set `HARBOR_DEPLOYMENT_ENV=staging`;
   - use staging-only random cookie, rate-limit, and root keys.
8. Do not assign those secrets to Preview or Development.
9. Create the initial deployment.
10. For later releases, open **Deployments → Create Deployment**, enter the exact
    verified commit SHA, and create the deployment manually.
11. Confirm `/api/healthz` returns readiness without account or database details.

Validate email sign-in, allowlist denial, secure cookies, CSP, HSTS, Host/Origin
checks, CSRF, RLS isolation, disposable account onboarding, restore, and keepalive.

## 5. Create the Railway staging worker

1. In Railway, choose **New Project → Deploy from GitHub repo**.
2. Select `krishna0605/supabase-harbor`.
3. Name the project `supabase-harbor` and the service `keepalive-worker`.
4. Create or rename the current environment to `staging`.
5. In the service settings, set **Config File Path** to
   `/railway.worker.json`.
6. Confirm the deployment reads:
   - build: `npm run typecheck`;
   - start: `npm run worker:sweep`;
   - cron: `*/15 * * * *`;
   - restart policy: `Never`.
7. Connect the repository’s `main` branch and enable **Wait for CI**.
8. Add the staging Railway variables from the inventory:
   - use the test worker login’s pooled TLS URL;
   - use the same staging root key/version as Vercel;
   - set `HARBOR_DEPLOYMENT_ENV=staging`.
9. Do not generate or attach a public domain.
10. Deploy the same commit SHA used by Vercel staging.
11. Run one cron execution and confirm it records a completed worker sweep and exits.
12. Disable the staging cron after acceptance unless it is needed for release tests.

## 6. Configure production email authentication

Enable email sign-up and sign-in in production Neon Auth. Remove every OAuth
provider, add only the exact production origin as a trusted domain, and disable
localhost.

## 7. Create the Vercel production project

1. Choose **Add New → Project** and import the same GitHub repository.
2. Use `supabase-harbor` as the project name, or the documented fallback if occupied.
3. Keep the root directory at repository root, framework Next.js, and Node.js 24.x.
4. Add only production Vercel variables:
   - production web login pooled TLS URL;
   - production Neon Auth URL;
   - production-only cookie, rate-limit, and root keys;
   - `HARBOR_ALLOWED_EMAILS=<approved production addresses>`;
   - the exact generated production HTTPS origin;
   - `HARBOR_DEPLOYMENT_ENV=production`.
5. Do not add owner, migration, worker, test, or previous-key credentials.
6. Create a deployment from the staging-approved commit SHA.
7. Verify health and sign in with an approved email account.
8. Confirm the first login creates one user vault and default settings.
9. Confirm a denied email identity receives `403` and creates no Harbor rows.

After production is stable, set the GitHub repository variable
`PRODUCTION_HEALTHCHECK_URL` to the production origin. The committed hourly workflow
will begin checking `/api/healthz`.

## 8. Activate the Railway production worker

1. Inside the existing Railway Harbor project, create the `production` environment
   by duplicating configuration only—not secret values—from staging.
2. Keep the service name `keepalive-worker`, config path
   `/railway.worker.json`, branch `main`, and **Wait for CI** enabled.
3. Enter independent production Railway variables:
   - production worker login pooled TLS URL;
   - the same production root key/version used by Vercel;
   - `HARBOR_DEPLOYMENT_ENV=production`.
4. Confirm there is no public domain.
5. Deploy the staging-approved commit.
6. Confirm the process starts on schedule, writes sanitized sweep telemetry, and
   exits without open handles.
7. Confirm Harbor reports the worker as healthy after a completed sweep.

## 9. Production smoke test

Use only disposable Supabase credentials:

1. Connect a disposable account and refresh its projects.
2. Load service health.
3. Run Harbor’s hardened enrollment SQL manually in a disposable Supabase project.
4. Enroll keepalive and run one heartbeat.
5. Restore only an intentionally paused disposable project.
6. Confirm activity and worker history contain no secret material.
7. Revoke the disposable PAT and remove Harbor’s local account record.
8. Review Vercel, Railway, and Neon logs for secret fixtures.

## Monitoring and stabilization

- Enable Vercel deployment and runtime failure notifications.
- Enable Railway failed-deployment and failed-cron notifications.
- Monitor Neon connection errors, slow queries, storage, and branch health.
- Review logs after one hour, 24 hours, and seven days.
- Treat a worker sweep older than 45 minutes as delayed.
- Retain worker sweep telemetry for 30 days and job/attempt history for 90 days.

## Rollback

| Failure                          | Response                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Web regression                   | Promote the previous known-good Vercel deployment                                  |
| Worker regression                | Disable cron and redeploy the previous verified commit                             |
| Incorrect platform variable      | Correct it in the secret manager and redeploy                                      |
| Authentication failure          | Restore the previous email-auth and trusted-domain configuration                   |
| Pre-production migration failure | Delete the release-candidate branch                                                |
| Production database failure      | Stop services and recover from the pre-release branch                              |
| Root-key mismatch                | Stop both services and restore the exact prior key configuration                   |
| Suspected exposure               | Disable services, rotate the credential, revoke sessions, inspect redacted records |

Do not use destructive down migrations. Database recovery uses a forward fix or a
reviewed recovery branch.

## Final release checklist

- Migrations `0000` through `0006` are recorded in production.
- Production Auth has email/password as its only sign-in method.
- Only explicitly allowlisted email addresses can create Harbor tenant data.
- Vercel is healthy on the stable HTTPS origin.
- Railway has no public domain and completes scheduled sweeps.
- Web and worker use separate restricted database logins.
- Staging and production secrets are independent.
- Host, Origin, cookie, HSTS, CSP, CSRF, RLS, and rate-limit checks pass.
- Disposable refresh, health, restore, and heartbeat smoke tests pass.
- CI, CodeQL, dependency audit, and secret scans pass.

Official references:

- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration)
- [Railway config as code](https://docs.railway.com/config-as-code)
- [Railway cron jobs](https://docs.railway.com/cron-jobs)
- [Railway GitHub deployments](https://docs.railway.com/deployments/github-autodeploys)
