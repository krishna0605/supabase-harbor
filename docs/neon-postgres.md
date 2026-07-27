# Neon Postgres

Neon Serverless Postgres stores Harbor’s tenant vault envelopes, cached metadata,
settings, and activity. Managed Neon Auth stores identities and sessions in its
branch-local `neon_auth` schema.

## Connections

Use a pooled connection for the Next.js runtime:

```text
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
```

Use the corresponding direct connection for Drizzle migrations:

```text
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require
```

Store both values in ignored `.env.local`. Never commit, log, paste into an issue, or
send them to browser code.

## Migrations

Generate a migration after changing the Drizzle schema:

```powershell
npm run db:generate
```

Review the generated SQL. Validate production changes on a temporary Neon branch,
then promote the exact reviewed migration. Apply committed migrations locally with:

```powershell
npm run db:migrate
```

The Phase 2 baseline creates eight Harbor tables. Phase 3 adds tenant ownership,
`user_vaults`, composite ownership keys, the restricted runtime role, forced RLS,
the GitHub identity resolver, and removes the obsolete local vault table. Default
settings are seeded when an approved user first enters Harbor.

## Isolated tests

Integration tests require a persistent Neon branch named `test` and a database named
exactly `harbor_test`. Put its pooled and direct connections in ignored
`.env.test.local`.

Database cleanup is rejected unless all conditions are true:

```text
NODE_ENV=test
ALLOW_DATABASE_RESET=1
current_database()=harbor_test
```

Run migrations and tests with:

```powershell
$env:NODE_ENV = "test"
npm run db:migrate
npm run test:integration
```

## Recovery

Do not edit production tables manually. Use a Neon branch or point-in-time restore to
inspect and recover a previous database state. Deleting a Harbor tenant removes only
that user’s Harbor rows and never invokes a Supabase project deletion endpoint.

Managed Neon Auth must be provisioned separately for each branch that performs live
sign-in. The isolated `harbor_test` database intentionally uses a non-authenticating
identity stub so destructive persistence tests cannot create live Auth sessions.

## Applied production migrations

- [2026-07-27 production baseline](migrations/2026-07-27-neon-baseline.md)

The Phase 3 production migration remains pending explicit approval.
