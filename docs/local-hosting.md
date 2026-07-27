# Local development and hosting

Phase 3 can still run locally at `http://127.0.0.1:47832`, but identity now comes from
Managed Neon Auth and GitHub OAuth rather than a local master password.

Create ignored `.env.local` and `.env.test.local` files from `.env.example`. The
production runtime URL must be pooled; migration URLs must be direct. Managed Neon
Auth must be enabled on the branch containing Harbor’s production tables.

The GitHub OAuth application and Neon Auth trusted origins must include the exact
local origin. Configure only GitHub as a sign-in provider.

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
