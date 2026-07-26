# Supabase Harbor — Design Direction

## Direction contract

**THESIS:** Harbor is a tide table. Every project sits in a seven-day window that is
always draining, and the interface exists to show how much water is left under each
hull before it runs aground.

**OWN-WORLD:** Slate-indigo ground with verdigris — the green of oxidized copper, which
is what harbour metal actually becomes. Brass for warning, flare-orange for critical.
Expanded stencil display type borrowed from port signage and container markings, set
against monospace data. Depth is drawn, not decorated: every project carries a margin
bar that drains rather than fills.

**STORY:** The first viewport moves from exposure (how many projects are at risk) to
the tide itself (the table, ordered by who runs aground first), to action (restore,
enroll, refresh) — never from decoration to content.

**FIRST VIEWPORT:** At 1440×900 the header, the five-tile risk strip, the filter bar,
and at least six project rows must be visible with their margin bars readable.

**FORM:** One dominant table on a dark ground, with a persistent rail. The form is
pinned by the product's own data shape — time-decay across many rows — not by a
category habit.

## Anti-references

The previous Harbor identity (navy rail, mist canvas, sea-glass teal, four neutral
count tiles) is evidence of the problem, not a starting point. It read as a generic
operations dashboard and expressed nothing about time running out. Do not reintroduce:

- Mist/paper-white canvas as the primary ground.
- Sea-glass teal `#0f8b78` as the accent.
- Count tiles that carry no risk ordering.
- Bare time-of-day stamps for values that may be days old.
- Status conveyed by a pill alone, with no magnitude.

Also excluded, as saturated defaults unrelated to this product: warm-cream with serif
display, purple-to-blue gradients, acid-green-on-black terminal cosplay, emoji as
section markers, and card grids with a coloured left rail.

## Mode

**Operate.** The visitor is completing a task, usually under mild time pressure. Scan
speed, stable geometry, and unambiguous state outrank expression. Personality lives in
the palette, the display face, and exactly one authored motion moment — not in layout
novelty.

## Visual system

### Color

Neutrals are green-cool, derived from the accent rather than inherited grey. Dark is
the default theme; light is a full peer, not an inversion.

| Token              | Dark      | Light     | Role                              |
| ------------------ | --------- | --------- | --------------------------------- |
| `--ground`         | `#0b1117` | `#f5f7f6` | App background                    |
| `--surface`        | `#131c24` | `#ffffff` | Panels, table                     |
| `--surface-raised` | `#1a252f` | `#f2f6f4` | Header rows, hover, popovers      |
| `--rail`           | `#070c11` | `#0b1117` | Navigation rail — darkest in both |
| `--border`         | `#24323d` | `#dfe6e3` | Dividers                          |
| `--border-strong`  | `#33454f` | `#c6d2ce` | Control outlines                  |
| `--text`           | `#e4edea` | `#16211c` | Primary text                      |
| `--muted`          | `#8b9e98` | `#5e6f69` | Labels, metadata                  |
| `--verdigris`      | `#47b39c` | `#2e8c77` | Accent, primary action, protected |
| `--verdigris-wash` | `#102b26` | `#e3f2ed` | Selected and active backgrounds   |
| `--brass`          | `#d99a3c` | `#a8710f` | Warning, slipping, paused         |
| `--brass-wash`     | `#2c2110` | `#fdf3e2` | Warning backgrounds               |
| `--flare`          | `#f0644a` | `#c0402a` | Critical, failed, at risk         |
| `--flare-wash`     | `#2e1712` | `#fdeeea` | Critical backgrounds              |

Semantic colour (verdigris / brass / flare) is a scale, not decoration: it maps to
remaining margin and is always paired with an icon and a text label so nothing depends
on hue alone.

### Type

- **Display** — Archivo, variable weight and width, used expanded at 600–700 for page
  titles and metric values. Port signage, not editorial.
- **Body** — Geist Sans, 13–15px for interface copy.
- **Data** — Geist Mono for refs, timestamps, counts, codes, and every column of
  aligned digits. `font-variant-numeric: tabular-nums` throughout.

Section labels are 11px mono, uppercase, `0.12em` tracking. Page titles 30–36px display
at `-0.03em`. No serif anywhere.

### Shape and spacing

- 4px base grid; 8px rhythm for stacked groups.
- 8px control radius; 12px panel radius; full radius only on status pills and dots.
- 40px default controls; 48px comfortable table rows, 36px compact.
- One-pixel borders. Shadows only for overlays.
- Rail 232px desktop, 64px icon-only at ≤1280px, top bar at ≤980px.

## Motion

Motion explains state and decay. It never makes the visitor wait.

**Focal moment — the tide line.** When a refresh or keepalive sweep runs, a verdigris
gradient advances once across the table header, left to right, over 900ms. It fires on
a real sweep only, never on render, and it is the single authored moment in the
product.

**Supporting motion:**

- Margin bars animate from full to their true value on first paint, so the eye reads
  depletion rather than progress. 600ms ease-out, once per mount.
- Rows settle upward on a spring with 40ms stagger on first load only — never on
  refetch, never on filter change.
- Status changes pulse the affected pill once, 400ms.
- Theme changes cross-fade through the View Transitions API where supported.
- Routine feedback (hover, focus, press) stays at 120–160ms on colour and transform.

Every one of these is disabled under `prefers-reduced-motion: reduce`, including the
tide line, which becomes a static rule.

## Page composition

- **Unlock:** one credential panel against a tide-gradient field; a security note beside
  it. No hero.
- **Dashboard:** rail, title with sweep action, five-tile risk strip, filter bar, one
  unified table with expandable rows and a sticky batch bar on selection.
- **Keepalive:** enrollment in three explicit steps, then a status table mirroring the
  dashboard's protection vocabulary.
- **Accounts:** operational list, inline status and last sync, dedicated add form. The
  token is never redisplayed.
- **Activity:** chronological table, grouped by refresh, restore, and keepalive.
- **Settings:** plain sections — refresh, keepalive, theme, password, reset.

## Interaction and states

- Every interactive element has hover, focus-visible, active, disabled, pending, and
  error states. Focus rings are verdigris at 3px with 2px offset.
- Destructive and upstream-write actions confirm, naming project and account.
- Loading preserves layout with skeleton rows at the true row height.
- Empty states name the next action. The dashboard's empty state leads to enrolling
  keepalive, not merely adding an account, because an unenrolled account changes
  nothing.
- Errors preserve cached content and say plainly when data is stale.
- Below 700px the table becomes stacked cards; a seven-column table has no honest phone
  layout.

## Accessibility floor

- WCAG AA on all text and on every status indicator, in both themes.
- No state distinguished by colour alone — always icon plus label.
- All controls reachable and operable by keyboard; visible focus at every stop.
- Motion fully removable; the interface loses nothing but the tide line.
