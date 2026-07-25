# Supabase Harbor — Design Direction

## Direction contract

**THESIS:** Harbor is a quiet watchfloor: one clear operational surface for seeing
what needs attention and acting with confidence.

**OWN-WORLD:** The interface uses a deep navy rail, mist-cool canvas, sea-glass teal,
fine steel borders, compact status markers, and an anchor-shaped H mark.

**STORY:** The first viewport moves from orientation (Projects) to situation
(four counts), to control (search and filters), to the evidence-rich unified table.

**FIRST VIEWPORT:** At 1440×900 the complete header, four summary blocks, stale-data
notice, filters, and at least five project rows must be visible.

**FORM:** A restrained operational control room centered on one table. The form is
pinned by the implementation plan, the generated Image Gen concept, and 21st.dev
research, so no random form seed is used.

## Mode

Operate mode. Familiar controls, stable geometry, compact rows, explicit labels, and
minimal motion. The design avoids promotional flourishes, floating card grids, glass,
gradients, oversized type, and decorative animation.

## Component references

21st.dev was used to compare practical component families:

- Origin UI informed compact, label-forward inputs, native selects, and the enhanced
  shadcn table treatment.
- shadcn/ui informed predictable dialogs, menus, buttons, and accessible primitives.
- Geist-like restraint informed spacing, typography, and subdued borders.

These are pattern references, not copied page designs. Harbor's composition, colors,
data hierarchy, and status language remain product-specific.

## Visual system

### Color

| Token          |     Value | Role                             |
| -------------- | --------: | -------------------------------- |
| Ink navy       | `#101c2d` | Navigation rail                  |
| Canvas         | `#f4f7f8` | App background                   |
| Surface        | `#ffffff` | Table and controls               |
| Steel border   | `#dce4e7` | Dividers and boundaries          |
| Primary text   | `#18232f` | Headings and important values    |
| Secondary text | `#667581` | Labels and metadata              |
| Harbor teal    | `#0f8b78` | Primary actions and active state |
| Teal wash      | `#e8f5f1` | Selected and active backgrounds  |
| Amber          | `#b7770d` | Paused and stale states          |
| Red            | `#b84141` | Failed and unhealthy states      |

### Type

Use Geist with Segoe UI and system fallbacks. Page headings are 30–34px and semibold;
section labels 12–13px with deliberate tracking; body and table copy 13–15px. Numbers
use tabular figures. No display typography is used.

### Shape and spacing

- 8px base spacing grid.
- 10px control radius; 12px panel radius; full-radius status pills only.
- 42px default controls and 48–52px table rows.
- One-pixel borders; shadows only for modal separation.
- Sidebar width 224px desktop, compact top bar on narrow layouts.

## Page composition

- **Setup / unlock:** one focused credential panel plus an adjacent security note,
  never a marketing hero.
- **Dashboard:** persistent rail, compact heading actions, summary strip, filters,
  stale-state banner, and one unified project table.
- **Accounts:** operational list with inline status, last sync, and a dedicated add
  form; PAT is never redisplayed.
- **Activity:** chronological table grouped by refresh and restore outcomes.
- **Settings:** plain sections for refresh, password, lock, paths, and reset.

## Interaction and states

- Every interactive element has hover, focus-visible, active, disabled, pending, and
  error states.
- Restore uses a confirmation dialog naming both project and account.
- Loading preserves layout with quiet skeleton rows.
- Empty states explain the next action; errors preserve cached content when possible.
- Motion is limited to 120–180ms color/opacity transitions and a reduced-motion
  fallback.
