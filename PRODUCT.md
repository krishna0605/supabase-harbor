# Supabase Harbor — Product Context

## Product

Supabase Harbor is an unofficial, private, local-first dashboard for one person who
manages several authorized Supabase accounts. It replaces browser-profile hopping
with one encrypted view of accounts, organizations, projects, health, and restore
activity.

## Users and operating context

- Primary user: a technical Windows 10/11 user managing their own Supabase accounts.
- Runtime: one local Next.js process bound only to `127.0.0.1`.
- Daily setting: a desktop browser, often during a quick project-status check.
- Data posture: cached metadata and encrypted Personal Access Token envelopes in Neon
  Postgres; tokens are only decrypted in local server memory while the vault is
  unlocked.

## Core jobs

1. Connect multiple accounts without storing plaintext tokens.
2. See every project in a fast, unified, filterable view.
3. Understand stale, unhealthy, paused, and transitioning states without ambiguity.
4. Restore a paused project through the official Supabase Management API.
5. Audit refresh and restore outcomes without exposing sensitive payloads.

## Positioning

Harbor is a focused local operations console, not a replacement for the Supabase
dashboard. It exposes one upstream write—restore—and deliberately excludes SQL,
billing changes, logs, key management, synthetic keepalive traffic, project deletion,
and remote access.

## Brand and experience commitments

- Calm, exact, operational, and trustworthy.
- Dense enough for fifty projects, but never visually noisy.
- Status is communicated by text and icons in addition to color.
- Cached information is never presented as live after a failed refresh.
- Local-only actions explicitly state that they do not alter Supabase resources.

## Success

Ten accounts and fifty cached projects remain responsive; one account failure never
blocks the rest; an inactive project can be restored and reconciled; no plaintext PAT
appears in PostgreSQL, logs, browser storage, API responses, or client bundles.

## Evidence

No production analytics or user research exists yet. The initial product context is
the detailed implementation plan and the user's stated multi-account workflow.
