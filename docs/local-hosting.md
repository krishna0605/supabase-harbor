# Local development and hosting

Phase 3 can still run locally at `http://127.0.0.1:47832`, but identity now comes from
Managed Neon Auth email/password sessions rather than a local master password.

Create ignored `.env.local` and `.env.test.local` files from `.env.example`. The
production runtime URL must be pooled; migration URLs must be direct. Managed Neon
Auth must be enabled on the branch containing Harbor’s production tables.

Neon Auth trusted origins must include the exact
local origin. Configure only email/password sign-in.

The launcher continues to bind to `127.0.0.1`. `HARBOR_ORIGIN` controls accepted Host
and Origin values and must exactly match the browser URL. Public deployment is not
supported until Phase 5.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
.\harbor.ps1
```

Updates use `git pull --ff-only`, `npm ci`, verification, and committed Drizzle
migrations. The setup script must never rewrite `.env.local` or print its secrets.

The isolated integration database remains `harbor_test`. Destructive cleanup is
allowed only when:

```text
NODE_ENV=test
ALLOW_DATABASE_RESET=1
current_database() = 'harbor_test'
```

Managed-auth behavior is unit-tested with synthetic sessions; live auth smoke tests
use the branch-local `neondb` Managed Neon Auth installation.

## Keepalive worker

The worker is a separate, short-lived process:

```powershell
$env:WORKER_DATABASE_URL="<pooled TLS worker connection>"
npm run worker:sweep
```

Its connection role must be explicitly allowed to `SET ROLE harbor_worker`. The
worker refuses to start without its database URL and the same active root-key
configuration used by the web app. Never use a project key as an environment
variable.

The committed Railway configuration schedules a sweep every 15 minutes. It is a
deployment artifact only; production Railway activation, platform secrets, and
monitoring are Phase 5 work.
