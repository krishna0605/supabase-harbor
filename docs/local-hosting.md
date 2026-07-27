# Local hosting

Harbor is a local web application, not a remotely hosted service. The launcher always
passes `--hostname 127.0.0.1`. The proxy rejects any Host other than the configured
`127.0.0.1` origin and checks Origin for state-changing requests.

`HARBOR_PORT` may select a different local port. When it changes, the launcher and
server must receive the same value. Database state is stored in Neon Postgres.
Redacted diagnostic logs remain under `%LOCALAPPDATA%\SupabaseHarbor\logs`.

The source repository can be moved anywhere—scripts resolve paths from their own
location. Create an ignored `.env.local` containing pooled and direct Neon connection
strings before running setup.

Updates use `git pull --ff-only` followed by `scripts/setup.ps1`. The setup script
uses `npm ci`, never resets the vault, and applies committed Drizzle migrations using
the direct connection. Neon branch restore and point-in-time recovery replace local
SQLite backup files.
