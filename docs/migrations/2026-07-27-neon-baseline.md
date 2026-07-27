# Neon production baseline — 2026-07-27

The Phase 2 PostgreSQL baseline was promoted through Neon’s temporary migration
workflow and verified on the production branch.

## Migration record

- Neon project: `supabase-harbor` (`solitary-art-80632835`)
- Database: `neondb`
- Production branch: `production` (`br-restless-paper-ax48n0c1`)
- Neon migration ID: `12f289b1-ac1a-44d5-9869-e4f929056997`
- Drizzle migration: `0000_workable_nico_minoru.sql`
- Drizzle migration hash:
  `702ba510d5ad5c1701eb8a55208597941d88f82c9258c38162593c68cf613930`
- Temporary validation branch: deleted automatically after successful promotion

## Verification

- Eight Harbor application tables are present.
- Six foreign-key constraints are present.
- All four required query indexes are present.
- The two default settings are seeded.
- Drizzle’s migration ledger contains the baseline entry.
- Production account and project tables were empty at migration time.
- Re-running `npm run db:migrate` completed without attempting to recreate the
  baseline.
- Lint, type checking, 56 unit tests, 6 Neon integration tests, and the production
  Next.js build passed after promotion.

No Supabase Personal Access Token, Neon connection string, or application data is
included in this record.
