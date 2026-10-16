> Status: ACTIVE

# HANDOFF — S6 integration

**For:** the S6 integration shard. **From:** the parent session, 2026-10-16.

State: S0–S5 merged on `main`; `npm run check` 0 errors, `npm test` 535/535. `App.svelte` is still the S0 skeleton: every component exists but nothing is wired. The Pages site serves that skeleton.

Parent fixes already on `main` (commit `96c8c6a`): the data worker is spawned lazily on first request; `seriesColors` falls back by position for names the palette map lacks; two tests now expect the real formatter's output.

## Seams reported by the shards (verbatim, trimmed to what S6 must act on)

### S1 data engine
- `FieldMeta.dateFormat` for ERCOT timestamps is `yyyy-MM-dd'T'HH:mm` (added as a candidate; TABLEAU-SPEC §1.2 needs the row).
- `MIN`/`MAX` of a string measure return the dictionary code (`ResultMeasure.values` is Float64Array). UI should disallow or map via the dict.
- `I32Builder` promotes to f64 at any row (never coerces a late decimal to null).
- `DateLevel` has no `weekday`; §4.2 mentions it. Not implemented.
- `TOP_VALUES_LIMIT` is 20 in constants, §1.3 says 10; code wins.
- Perf measured: 430K-row parse ≈ 2.0 s, 3-dim group-by ≈ 15 ms warm.

### S2 format + palette
1. Red negative style: `ValueFormatter` returns a string; `red`/`-red` prefix `NEGATIVE_MARK` (U+200B). UI calls `formatNumberParts()` / `isNegativeMarked()` / `stripNegativeMark()`.
2. `makeAxisFormatter(meta, spec, axisMax)` added for shared `auto` units on axes; S3 should use it for ticks.
3. `autoDateFormat(treatment)` and `datePartLabel(part, n)` added; part dims must be labelled by the caller.
4. Week part label is `Wk 12` per TABLEAU-SPEC §4.2.
5. Stable label→color map is a per-field memo in `pick.ts` (`resetColorMemo()` exported); cleaner fix is passing `FieldProfile.labels` into `pickPalette` (contract change, deferred).
6. `Palette` gained `labelsRequired` and `validation`.
8. `bold` set has an adjacent ΔE of 0; shipped `labels-required`; owner may drop it.
9. Locale default is `en-US` (R-PURE forbids `navigator`).

### S3 charts
1. `BuildContext.theme?: ChartTheme` added (optional); `DEFAULT_THEME` mirrors `app.css` when absent. S6 may read tokens with `getComputedStyle` in `ChartCanvas` and pass them.
2. `PICKER_GROUPS` exported from `registry.ts` for the 13 picker groups.
3. `needsFor(spec)` in `registry.ts`: the query caller must pass `queryOf(spec, needsFor(spec))` (scatter/bubble/parallel disaggregate only without a grouping dimension).
5. Show Me counts a date pill as a dimension; streamgraph/calendar check `trunc`/`day` via `requires.exact`.
6. Text table with 0 pills should show the raw first 200 rows via `client.rows()`; `ChartCanvas` shows a hint until S6 wires it.
7. Show Me's `text-table` move puts M₁ on Label and M₂… on Tooltip; histogram's move adds a `count` pill on Rows.
8. `__meta` on built options carries data notes; `ChartCanvas` strips it and toasts once per note.

### S4 shelves, drag, fields
1. `$core`/`$stores` aliases resolve in svelte-check and vite build but not in Vitest (no `resolve.alias`). S4 used relative imports; S6 may add aliases to `vite.config.ts`.
3. Filter defaults on drop live in `drop-rules.defaultFilter`: `range` null bounds, `dateRange` null bounds, `categorical` `exclude: []` — all pass-all. `ShelfPanel` calls `onFilter(pillId)` right after a drop on Filters.
4. Dialog hooks are callback props: `ShelfPanel { onFormat(pillId), onFilter(pillId) }`, `FieldPanel { onFormat(field), onChangeType(field, type, dateFormat?) }`. S6 wires them to S5's dialogs and `dataset.setType`.
5. Desktop panes stay mounted under `display:none` on phones; `ShelfPanel`/`FieldPanel` ignore controller events when `getClientRects().length === 0`. Keep that, or unmount the panes.
6. Phone flow: S6 renders `ShelfPanel` in the `shelves` sheet (`showMarks={false}`) and the Marks card in the `marks` sheet; tapping a field sets `ui.tapSelection` and `ui.sheet = 'shelves'`.
8. `MarksCard` has a plain chart-type `<select>`; S3's `ChartPicker` supersedes it.
Left undone: `ZoneSpec.accepts` implemented but unused (Shape ≤ 10 values, Size wants a continuous measure); pill alias editing has no UI.

### S5 dialogs, data flow, views
1. Vitest resolves Svelte's server runtime, so `$effect`/`$derived` are no-ops in unit tests; decision logic is in plain functions. Fix: `resolve.conditions: ['browser']` (or `test.alias`) in `vite.config.ts`.
2. Dialog open state has no home: dialogs take `open` + `onclose` (+ `target`/`pillId`) props. S6 hosts that state in `App.svelte` or extends `ui` with `dialog: { kind, target } | null`. PillMenu "format" passes `{ kind: 'pill', pillId }` (`FormatTarget` from `FormatDialog.svelte`).
3. Boot wiring: `const s = await views.restoreFromHash(); if (s) dataset.load(entry, url, s)` with `entry` found in the manifest by `s.datasetId`; `load(entry, source, initialSpec?)`. Call `query.start()` and `views.start()` once on mount (they return stop functions).
4. `dataset.load` takes an absolute URL built as `new URL(BASE_URL + entry.file, document.baseURI)`.
5. Decimals range: contract says 0..10, TABLEAU-SPEC §7.1 says 0–15; contract followed; sync the doc.
8. Palette defaults duplicated in `PaletteDialog.defaultPaletteId`; S2 could export one.
Left undone: PNG export is wired to a `toPng` prop that `ChartCanvas` supplies; bottom-sheet variant not exercised.

## What S6 must deliver (see docs/shards/S6-integration.md)
Wire `App.svelte` end to end; host dialog state; call `queryOf(spec, needsFor(spec))`; pass the theme; raw-rows text table; phone sheets; add `resolve.conditions: ['browser']` and path aliases to the Vite config if they unblock tests; Playwright smoke at 1280×800 and 390×844 against the built `dist/`; perf RESULT record; `docs/ARCHITECTURE.md`; README screenshots; TABLEAU-SPEC rows for the seams above (`yyyy-MM-dd'T'HH:mm`, decimals 0..10, top values 20, filter-drop defaults).
