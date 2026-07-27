# Supabase Harbor — Product Context

## Product

Supabase Harbor is an unofficial private dashboard for approved users who manage
several authorized Supabase accounts. It replaces browser-profile hopping with one
encrypted view of accounts, organizations, projects, health, and restore activity.

## Users and operating context

- Primary users: explicitly allowlisted GitHub identities managing only their own
  authorized Supabase accounts.
- Runtime: Next.js with Managed Neon Auth and Neon Postgres; public deployment is a
  later release gate.
- Daily setting: a desktop browser, often during a quick project-status check.
- Data posture: tenant-isolated metadata and encrypted PAT envelopes in Neon;
  tokens are decrypted only during one server operation.

## Core jobs

1. Connect multiple accounts without storing plaintext tokens.
2. See every project in a fast, unified, filterable view.
3. Understand stale, unhealthy, paused, and transitioning states without ambiguity.
4. Restore a paused project through the official Supabase Management API.
5. Audit refresh and restore outcomes without exposing sensitive payloads.

## Positioning

Harbor is a focused operations console, not a replacement for the Supabase
dashboard. It exposes one upstream write—restore—and deliberately excludes SQL,
billing changes, logs, key management, synthetic keepalive traffic, project deletion,
and broad Supabase administration.

## Brand and experience commitments

- Calm, exact, operational, and trustworthy.
- Dense enough for fifty projects, but never visually noisy.
- Status is communicated by text and icons in addition to color.
- Cached information is never presented as live after a failed refresh.
- Harbor-only deletion actions explicitly state that they do not alter Supabase
  resources.

## Success

Ten accounts and fifty cached projects remain responsive; one account failure never
blocks the rest; an inactive project can be restored and reconciled; no plaintext PAT
appears in PostgreSQL, logs, browser storage, API responses, or client bundles.

## Evidence

No production analytics or user research exists yet. The initial product context is
the detailed implementation plan and the user's stated multi-account workflow.
