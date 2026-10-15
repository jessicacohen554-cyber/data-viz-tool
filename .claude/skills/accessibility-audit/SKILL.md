---
name: accessibility-audit
description: Audit the Svelte app (src/App.svelte, src/lib/ui/**, src/app.css) for text readability, color contrast, touch-target size and keyboard reach against WCAG AA on the light Observatory surface. Checks pills, shelves, drop targets, legends, tooltips, dialogs and bottom sheets — low-contrast tinted pills, muted labels on tinted backgrounds, sub-44px touch targets on mobile, focus rings lost on custom controls. Use when the user says "check accessibility", "audit readability", "fix contrast", "can't read the pill", "too small to tap", or reports visibility or tap problems in the app.
---

# App accessibility & readability audit

Audit the worksheet UI for readability, contrast, touch-target size and
keyboard reach. Scope is the Svelte app only: `src/App.svelte`,
`src/lib/ui/**/*.svelte`, `src/app.css`. Chart marks and palettes are **not**
in scope here — `scripts/validate_palette.js` and `docs/PALETTES.md` §5 own
mark color; this skill owns the chrome around the chart.

The app is **light only** (D-6): one surface, `--bg-page #F8F9FC`, cards
`#FFFFFF`. There is no dark section and no dark-mode toggle, so the sibling
skill's `.section-dark` class of bug cannot occur; the bugs here are tinted
backgrounds, muted text, and small touch targets.

## Color system

Tokens are defined once, in `src/app.css` `:root` (rule 4 `[R-TOKENS]`: a
component never hardcodes a color, size or font — a literal hex, px font-size
or font-family in a `.svelte` file is a finding in itself).

Surfaces and text (ported from Observatory `shared.css`):
- `--bg-page: #F8F9FC`, `--bg-card: #FFFFFF`, `--navy: #1A2744`,
  `--navy-dark: #0F1A2E`, `--border: #D4D8E0`, `--border-light: #E5E7EB`
- `--text-primary: #000000`, `--text-secondary: #1E293B`,
  `--text-muted: #566370`, `--text-on-dark: #FFFFFF`,
  `--text-muted-dark: rgba(255,255,255,0.70)`
- WCAG-safe text variants: `--hydro-text #0369A1`, `--green-text #15803D`,
  `--amber-text #B45309`, `--purple-text #7C3AED`, `--red-text #B91C1C`,
  `--gray-text #374151`

Viz tokens (plan §3) — the ones most likely to fail:
- `--pill-discrete`: sky at 12% over white (`rgba(14,165,233,0.12)`), text
  `--hydro-text #0369A1`. Blue pill = discrete.
- `--pill-continuous`: green at 12% over white (`rgba(34,197,94,0.12)`), text
  `--green-text #15803D`. Green pill = continuous.
- `--shelf-bg`, `--drop-target` (sky dashed border), `--pill-dragging` shadow,
  focus ring 2px sky (`#0EA5E9`).

### Contrast on the pill tints (computed, light surface)

A 12% tint over white is still near-white (`--pill-discrete` ≈ `#E2F4FC`,
`--pill-continuous` ≈ `#E4F8EC`), so the *text* token decides:

| Text | on `--pill-discrete` | on `--pill-continuous` | on `#F8F9FC` |
|---|---|---|---|
| `--hydro-text #0369A1` | 5.25:1 PASS | — | 5.64:1 PASS |
| `--green-text #15803D` | — | 4.52:1 PASS (normal text: barely) | 4.76:1 PASS |
| `--text-muted #566370` | 5.44:1 PASS | 5.55:1 PASS | 5.84:1 PASS |
| `#0EA5E9` (the raw sky, as text) | 2.45:1 FAIL | — | 2.63:1 FAIL |
| `#22C55E` (the raw green, as text) | — | 2.05:1 FAIL | 2.16:1 FAIL |
| `--text-on-dark` on `--navy` | — | — | 14.81:1 PASS |

`--green-text` clears 4.5:1 by 0.02 on its own tint: a pill font below
0.8rem or a lighter weight on the continuous pill is a Medium finding even
though the ratio passes. (Recompute with the script in this skill's header
comment if a token moves; never re-type a ratio from memory.)

**The root cause of most pill bugs:** a component using the *mark* color
(`--hydro`, `--wind`, the raw sky/green) as text or icon color on the tint.
Only the `*-text` variants pass. Same for the aggregation prefix (`SUM(`) and
the date-level prefix (`YEAR(`) on a pill: they inherit the pill text token,
never a lighter one.

### WCAG AA requirements
- Normal text (< 18pt / < 14pt bold): **4.5:1**
- Large text (≥ 18pt / ≥ 14pt bold): **3:1**
- UI components, focus indicators, icons that carry meaning: **3:1**
- Touch targets on the phone layout (D-11, < 900px): **44 × 44 CSS px**
  minimum hit area (WCAG 2.5.5 AAA, adopted as the mobile floor here); pills
  may be visually smaller if padding or a pseudo-element extends the hit area.
- Keyboard: every pill, shelf, chip, segmented control, chart-type tile and
  sheet handle is reachable by Tab, operable by Enter/Space, and shows the
  2px sky focus ring (`:focus-visible`). Drag has a keyboard equivalent: the
  pill's "Add to…" menu (plan §10).

## Audit checklist

For each component under `src/lib/ui/`, check:

1. **Pills** (`shelves/Pill.svelte`) — text token on tint; aggregation /
   date-level prefix; the `+` drill and `▾` menu affordances ≥ 3:1 and ≥ 44px
   hit area on mobile; dragging state keeps text contrast under the shadow.
2. **Shelves and drop targets** (`shelves/Shelf.svelte`, `ShelfPanel.svelte`)
   — shelf label (eyebrow, 0.68–0.72rem uppercase) uses `--text-muted` or
   darker, never `--border`; the dashed drop-target border ≥ 3:1 against
   `--shelf-bg`; "drop here" hint text ≥ 4.5:1.
3. **Marks card** (`shelves/MarksCard.svelte`) — the six channel buttons have
   visible labels, not icon-only; selected state is not color-only.
4. **Field panel** (`fields/FieldPanel.svelte`, `FieldItem.svelte`) — type
   icon (Abc / # / calendar / T|F) has an accessible name; dimension/measure
   grouping is not conveyed by color alone (headers present).
5. **Chart picker** (`chart/ChartPicker.svelte`) — ineligible tiles are
   greyed **and** carry the "needs …" reason as text (tooltip + `aria-
   describedby`), not opacity alone; greyed label still ≥ 3:1.
6. **Dialogs** (`dialogs/*.svelte`) — focus trapped, Esc closes, first field
   focused on open, `<select>` custom chevron has a native fallback; number
   inputs ≥ 44px tall on mobile.
7. **Bottom sheets** (`shared/BottomSheet.svelte`) — handle ≥ 44px hit area;
   sheet content scrolls, the chart behind is `inert`; the bottom bar's four
   tabs ≥ 44px and labeled.
8. **Tooltip** (ECharts tooltip styled by tokens) — `--navy-dark` background
   with white mono values; `confine:true` so it never leaves the viewport on a
   phone; on touch it opens on tap and closes on tap-away.
9. **Toasts / progress** (`shared/Toast.svelte`, `ProgressBar.svelte`) — live
   region (`role="status"`), progress has a text percentage, not bar-only.
10. **Legend and axis text** (ECharts option built in `charts/option-common.ts`)
    — axis labels use `--text-secondary`, legend text `--text-primary`; 12px
    minimum on phone; axis label truncation keeps a full-name tooltip.
11. **Inline styles** — any `style="color:…"` or `font-size:…` literal in a
    `.svelte` file is a rule-4 finding regardless of contrast.
12. **Reduced motion** — transitions honour `prefers-reduced-motion`.

## Fix pattern

Fix at the token or component level, never per-instance:

```css
/* src/app.css — the pill text is the WCAG-safe variant, never the mark hue */
.pill--discrete   { background: var(--pill-discrete);   color: var(--hydro-text); }
.pill--continuous { background: var(--pill-continuous); color: var(--green-text); }

/* mobile hit area without growing the visual pill */
@media (max-width: 899px) {
  .pill { position: relative; }
  .pill::after { content: ""; position: absolute; inset: -8px; }
}
```

For keyboard gaps, add `tabindex="0"`, a `role`, and the `on:keydown`
handler that maps Enter/Space to the click action; never remove the outline —
style `:focus-visible` with the sky ring token.

## Output

Report findings grouped by severity:
1. **Critical** — text unreadable (contrast < 2:1), control unreachable by
   keyboard, or a touch target < 24px on mobile
2. **High** — contrast 2:1 – 3:1, or a touch target 24–43px on mobile
3. **Medium** — contrast 3:1 – 4.5:1 on normal text; meaning by color alone
4. **Low** — passes AA but breaks a token or design-intent rule

For each finding: file, line, element, current tokens/colors, measured ratio
or size, fix. Apply all Critical and High fixes directly (they are token or
component edits, reviewable in one diff). Ask before applying Medium/Low.
Re-run `npm run check && npm test` after fixes.
