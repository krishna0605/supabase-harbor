# Neon Postgres

Phase 2 stores Harbor vault envelopes, cached metadata, settings, and activity in
Neon Serverless Postgres. The application remains loopback-only and single-user until
the hosted authentication phase is complete.

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

The baseline migration creates the eight Harbor tables and seeds the default refresh
and idle-timeout settings. Drizzle records applied files in its own migration table,
so rerunning the command is safe.

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
inspect and recover a previous database state. Resetting the Harbor vault deletes
Harbor rows only and never invokes a Supabase project deletion endpoint.

## Applied production migrations

- [2026-07-27 production baseline](migrations/2026-07-27-neon-baseline.md)
