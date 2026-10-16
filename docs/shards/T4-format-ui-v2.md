SHARD T4 — formatting UI v2 (style panel, axis options, reference & trend lines, annotations, fonts). Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/t4-format-ui-v2`.

{{COMMON}}

CONTEXT: v0.1 UI is in `src/lib/ui/**` (S4/S5) wired by `src/App.svelte` (S6). Contract v2 adds `style`, `referenceLines`, `trendLine`, `annotations`, `axes.y2/synchronized`, `Pill.axis`. Read `src/lib/core/types.ts`, `constants.ts` (`FONT_FAMILIES`, `REFERENCE_LINE_KINDS`, `TREND_MODELS`), `docs/VIZSPEC.md` §v2, `docs/DECISIONS.md` D-14/D-16/D-19, `docs/TABLEAU-SPEC.md`, `src/lib/stores/ui.svelte.ts` (`ui.dialog`), `src/lib/ui/dialogs/Dialog.svelte`, `FormatDialog.svelte`, `src/lib/ui/shelves/PillMenu.svelte`.

OWNS: `src/lib/ui/dialogs/StylePanel.svelte`, `AxisDialog.svelte`, `ReferenceLineDialog.svelte`, `TrendLineDialog.svelte`, `AnnotationEditor.svelte`, `FontPicker.svelte`; `src/lib/ui/shelves/PillMenu.svelte` (add "Dual axis" / "Synchronize axis" / percentile aggregations are automatic from `AGGREGATIONS`); `src/lib/stores/ui.svelte.ts` (new dialog kinds only); their tests; `docs/TABLEAU-SPEC.md` §formatting additions.

DELIVER:
1. **Style panel** (Tableau's Format pane as a right-side panel on desktop, sheet on phone): font family (FontPicker: families from `FONT_FAMILIES` grouped sans/serif/mono, rendered in their own face once loaded via the `fonts.ts` loader T2 ships in `src/lib/ui/chart/` — if absent at your SHA, inject the Google Fonts link yourself in FontPicker and note it), font scale slider, per-element sizes (title/axis/labels/legend), title/subtitle/caption text, background color (swatches from the current palette + custom hex), border toggle, padding, legend show/position, mark labels show/position, opacity. Every control patches `spec` through `spec.patch` (R-SPEC).
2. **Axis dialog** (per axis x / y / y2): title (auto / custom / none), range auto/fixed min–max, log, reversed, **gridlines on/off**, show axis, tick number format (reuse FormatDialog's controls as a sub-panel), synchronize dual axes toggle.
3. **Number display** is already in FormatDialog; add quick presets in the pill menu (Number / Currency / Percent / K-M-B units / decimals 0–2) that write `fieldFormats`/`Pill.format` without opening the dialog.
4. **Reference lines dialog**: list + add/edit/remove `ReferenceLine` (axis, kind, value/percentile, band from/to, label, color, dash, scope).
5. **Trend line dialog**: enable, model, degree, per-series, show equation, color.
6. **Annotations**: `AnnotationEditor` opened from `ChartCanvas`'s `onMarkClick` (T2 ships the event; stub-safe: accept a prop `pending: {x,y,seriesKey}|null`); text edit, delete; list panel.
7. **Dual axis**: PillMenu entries "Dual axis" (toggle `Pill.axis`) on measure pills when ≥ 2 measures sit on the value shelf; "Synchronize axis" toggles `axes.synchronized`; combo marks (bar/line/area per axis) as a small segmented control in the Marks card when chartType is `combo`.
8. Register new `ui.dialog` kinds: `style`, `axis:{which}`, `reference`, `trend`, `annotation:{id|pending}`.

ACCEPTANCE: every dialog round-trips its fields to the spec and back (jsdom tests with the store); phone sheets keep ≥ 44 px targets; no hard-coded colors (R-TOKENS); `npm run check && npm test` green. Wiring into `App.svelte` is T6's; expose each component with `open` + `onclose` props like the S5 dialogs.
