# Local hosting

Harbor is a local web application, not a remotely hosted service. The launcher always
passes `--hostname 127.0.0.1`. The proxy rejects any Host other than the configured
`127.0.0.1` origin and checks Origin for state-changing requests.

`HARBOR_PORT` may select a different local port. When it changes, the launcher and
server must receive the same value. `HARBOR_DATA_DIR` may relocate local state for
testing, but the production default is `%LOCALAPPDATA%\SupabaseHarbor`.

The source repository can be moved anywhere—scripts resolve paths from their own
location. Runtime data intentionally remains in Windows LocalAppData.

Updates use `git pull --ff-only` followed by `scripts/setup.ps1`. The setup script
uses `npm ci`, never resets the vault, and prepares a migration backup only when an
older schema requires migration.
