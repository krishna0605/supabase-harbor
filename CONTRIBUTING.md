# Contributing

Thank you for helping improve Supabase Harbor.

## Before starting

- Search existing issues and pull requests.
- Open an issue before a large architectural or security change.
- Never include real Supabase credentials, vault files, logs, or customer data.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local development

Requirements:

- Windows 10 or 11
- Node.js 24.x
- npm
- PowerShell 5.1 or newer

```powershell
git clone https://github.com/krishna0605/supabase-harbor.git
Set-Location supabase-harbor
npm ci
npm run verify
```

Start development mode:

```powershell
npm run dev
```

## Pull requests

1. Create a focused branch from `main`.
2. Keep one logical change per commit where practical.
3. Add tests for behavior changes.
4. Run `npm run verify`.
5. Run `npm audit --omit=dev --audit-level=high`.
6. Describe security, migration, and user-facing implications.

Suggested commit prefixes:

```text
feat:
fix:
docs:
test:
chore:
security:
```

## Architecture rules

- `src/app/api` authenticates, validates, delegates, and serializes.
- Business behavior belongs in `src/features`.
- Supabase HTTP details belong in `src/server/supabase`.
- Persistence belongs in `src/server/database`.
- Client Components must not import `src/server`.
- Raw upstream errors and credentials must never reach the browser.
- Unknown Supabase statuses must fail safely as `unknown`.

## Security changes

Changes to cryptography, sessions, authorization, restore behavior, redaction, or
tenant boundaries require focused tests and an explicit security rationale.

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
