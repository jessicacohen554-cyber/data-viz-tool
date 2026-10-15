SHARD S4 — shelves, drag, fields. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/s4-shelves-drag`.

{{COMMON}}

GOAL: the Tableau worksheet UI: the data pane (field list), Columns/Rows/Filters shelves, the Marks card, pills with their menus, a Pointer-Events drag controller that works on touch, the tap-to-place fallback, the phone bottom sheet, toasts (owner decision D-11: chart-first with bottom sheets on phones).

OWNS:
- `src/lib/ui/fields/FieldPanel.svelte`, `FieldItem.svelte` — Dimensions / Measures groups, type icon (Abc, #, calendar, calendar-clock, T|F) in `--type-*` colors, search, context menu (Convert to Dimension/Measure, Change Data Type, Default format, Add to shelf…).
- `src/lib/ui/shelves/ShelfPanel.svelte`, `Shelf.svelte`, `Pill.svelte`, `PillMenu.svelte`, `MarksCard.svelte` — pills in `--pill-discrete-*` / `--pill-continuous-*` tokens showing `AGG(field)` / `YEAR(field)`; menu: aggregation, date level/mode with ▸ drill, discrete/continuous toggle, sort, format (opens S5's dialog through a callback prop), remove; drop indicators; single-pill shelves replace.
- `src/lib/ui/drag/drag-controller.ts` (pure DOM: `setPointerCapture`, 8 px or 180 ms long-press threshold, `touch-action:none` on pills only, ghost element, drop-zone hit-testing, keyboard "Add to…"), `use-draggable.ts`, `use-dropzone.ts` (Svelte actions).
- `src/lib/ui/shared/TopNav.svelte` (brand, Dataset/Views/Export slots as props), `BottomSheet.svelte`, `Toast.svelte`, `ProgressBar.svelte`, `Icon.svelte`.
- Tests: `drag-controller.test.ts` with synthetic PointerEvents under jsdom (`// @vitest-environment jsdom`), pill label rules, drop rules (a measure on Filters becomes a range filter pill; a date on Columns defaults to YEAR part).

CONSUMES: `stores/spec.svelte.ts` (`spec.addPill/movePill/removePill/updatePill/findPill`), `stores/ui.svelte.ts` (`ui.isMobile`, `ui.sheet`, `ui.tapSelection`, `ui.toast`), `core/spec-defaults.ts` (`newPill`), `charts/show-me.ts` (stub until S3), `stores/dataset.svelte.ts` meta list — S5 owns it; until it lands read `FieldMeta[]` from a prop so your components are testable standalone.

ACCEPTANCE: desktop drag pill → shelf and shelf → shelf; phone: long-press drag and tap-pill-then-tap-shelf both work in Chromium device emulation (describe your manual check); all tap targets ≥ 44 px on mobile; no hard-coded colors (R-TOKENS).
