> Status: ACTIVE — written by S0 as a skeleton, completed by S6 (integration) with S1–S5 merged, extended by T6 (integration v2) with T1–T5 merged. Code wins on conflict (R-TRUTH).

# Architecture

How the app is built. The contract it is built on is `src/lib/core/types.ts`
(narrated in [`VIZSPEC.md`](VIZSPEC.md)); what it must do is
[`TABLEAU-SPEC.md`](TABLEAU-SPEC.md), [`CHARTS.md`](CHARTS.md) and
[`PALETTES.md`](PALETTES.md). Rules cited by ID are in `CLAUDE.md`.

## 1. Shape

```
browser main thread                          Web Worker (src/workers/data.worker.ts)
┌──────────────────────────────────┐        ┌──────────────────────────────────────┐
│ App.svelte                       │        │ lib/data: csv-loader → type-inference│
│  lib/ui/* (Svelte, DOM)          │ msgs   │           → column-store              │
│  lib/stores/* (runes)  ◄────────►│◄──────►│ engine: filters → group-by → measures │
│    spec ── queryOf ── query      │        │ protocol.ts message unions (lib/data) │
│  lib/charts (ECharts option)     │        └──────────────────────────────────────┘
│  lib/format · lib/palette        │
└──────────────────────────────────┘
```

`VizSpec` is the only state (rule 1). `queryOf(spec)` derives a `QueryPlan`
that strips chart type, formats, marks and axes, so a change to any of those
re-renders without a worker round-trip; `queryKey(plan)` is canonical JSON and
keys a 16-entry LRU in `data-client.ts`.

## 2. Module map

| Directory | Owns | May import | Never imports |
|---|---|---|---|
| `lib/core` | types, constants, defaults, spec validation, `queryOf`, URL codec | nothing from `lib/*` | svelte, DOM, echarts |
| `lib/data` | protocol, column store, inference, date parsing, CSV loading, filters, engine, client | `lib/core` | svelte, DOM, echarts |
| `lib/format` | number and date formatting per `FormatSpec` | `lib/core` | svelte, DOM |
| `lib/palette` | registry, ramp generation, validation, `pick` | `lib/core` | svelte, DOM |
| `lib/charts` | ECharts setup, chart registry, Show Me, spec → option, transforms, decorations, maps, geo layer cache, style pass | `lib/core`, `lib/format`, `lib/palette`, `lib/icons`, `lib/data/{regression,stats,geo-names}` (pure statistics and name tables, never the engine or the client), `echarts/core` | svelte, DOM (except `ChartCanvas` in `lib/ui/chart`) |
| `lib/icons` | icon sets for the Shape shelf (`docs/ICONS.md`) | `lib/core` | svelte, DOM |
| `lib/stores` | runes stores: spec (+undo), dataset, query (effect pipeline), views, ui | everything above | — |
| `lib/ui` | Svelte components | everything | `lib/data` internals (only via `data-client`) |
| `workers` | the worker entry | `lib/data`, `lib/core` | DOM, echarts, svelte |

Enforced by `tests/boundary.test.ts` (rule 2) — there is no ESLint. The
`$core`, `$data`, `$format`, `$palette`, `$charts`, `$stores`, `$ui` path
aliases are declared twice on purpose: `tsconfig.json` `paths` for
svelte-check and `vite.config.ts` `resolve.alias` for the build and Vitest.

## 3. Data path

**Storage** (`column-store.ts`): strings → `Int32Array` codes into a sorted
dictionary (`dict`); whole numbers that fit → `Int32Array` (`i32`, promoted to
`f64` the moment a decimal appears, never coerced to null); other numbers →
`Float64Array` (`f64`); dates → epoch-ms `Float64Array` (`date`) parsed by a
pattern compiled from `FieldMeta.dateFormat`, never `Date.parse` on free text;
booleans → `Uint8Array` (`bool`). Nulls are a sentinel per storage.

**Loader** (`csv-loader.ts`): streaming `fetch` (or a `File`) → `TextDecoder`
→ PapaParse chunks (`header:false`, fast mode) → per-column builders;
`progress` replies at most every `PROGRESS_INTERVAL_MS`. Inference
(`type-inference.ts`, TABLEAU-SPEC §1.2) runs on the first
`INFERENCE_SAMPLE_ROWS` non-empty rows; `typeOverrides` from the spec are
applied before the builders run, so a converted column never parses twice.
Raw bytes are kept (`keepRaw`) so `setType` re-parses one column without a
re-download; when they were dropped the worker answers `needsReload`.

**Engine** (`engine.ts`): filters compile to cached `Uint8Array` masks ANDed
per query (`filters.ts`); group-by uses a dense mixed-radix key while the
product of dimension cardinalities is ≤ `DENSE_KEY_MAX_CELLS` (4M), else a
hash; one pass accumulates sum / count / min / max / sumsq; median, the fixed
percentiles P5…P95 (`stats.quantile`, type 7) and boxplot statistics bucket by
counting sort; COUNTD by sorted pairs; Top N is an inner aggregate then a
mask. `plan.bands` (the envelope's percentile mode) yields one `Float64Array`
per level over the same sorted buckets (`result.bands`). Derived date-part
columns are computed on first use and cached per level. `rowsOf()` serves the
raw-row preview.

**Geographic roles** (`type-inference.ts` + `geo-names.ts`): after the sample
is typed, each column is matched against the name tables (US states by name /
code / FIPS, countries by name / ISO-2 / ISO-3, the seven ERCOT model zones
with the weather-zone crosswalk, US counties under a county header) or the
coordinate ranges (latitude / longitude under a `lat` / `lon` header); a role
needs ≥ 80 % of the sample to match and the header hint breaks ties. The
result is `FieldMeta.geoRole`; a `typeOverrides[field].geoRole` from the spec
(including `null` for "none") is applied before the reply and re-applied on
`setType`, so the chart layer can read the override first and never needs a
reload for a role change.

**Client** (`data-client.ts`): promise API over the protocol; the worker is
spawned lazily on the first request (so importing a store never touches
`Worker`); a `result` older than the latest `query` rejects with
`{ stale: true }`; results are memoised in a `RESULT_CACHE_SIZE` LRU keyed by
`queryKey`. Everything handed to `postMessage` is `$state.snapshot`ed first: a
Svelte proxy cannot be structured-cloned.

## 4. Worker protocol

`src/lib/data/protocol.ts`. Every request carries a monotonic `id`; every
reply echoes it. Typed arrays in replies are transferred, not copied
(`transferablesOf()`).

| Request | Reply | Notes |
|---|---|---|
| `load { entry, source, typeOverrides, keepRaw, maxRows }` | `progress`* … `loaded { meta, rowCount, elapsedMs, warnings }` | `source` is an absolute URL or a `File`; `maxRows` is `MAX_ROWS_MOBILE` on phones; `typeOverrides[f].geoRole` (v2) is applied before inference |
| `query { plan }` | `result { result: QueryResult }` | `plan` is `queryOf(spec, needsFor(spec), limit)`; `plan.bands` → `result.bands` (v2), transferred like every other typed array |
| `profile { field, limit, search }` | `profile { profile: FieldProfile }` | the filter dialog's value list |
| `rows { offset, limit, fields, filters }` | `rows { fields, columns, total }` | numeric columns as `Float64Array`, others `string[]` |
| `setType { field, dataType, dateFormat }` | `meta { meta }` or `needsReload` | re-parse one column from the kept raw bytes |
| `cancel { targetId }` | `cancelled` | |
| `unload` | `unloaded` | |
| any | `error { message, code }` | `code`: `parse` · `network` · `memory` · `bad-request` · `internal` |

## 5. Format and palette

`lib/format/formatter.ts` is the one entry point: `makeFormatter(meta,
spec?)` returns a `ValueFormatter` for a field (automatic per type when no
`FormatSpec`), `autoFormat(meta)` the implied spec, `makeAxisFormatter(meta,
spec, axisMax)` a formatter whose `auto` unit is chosen once per axis.
Red-negative styles return a string prefixed by `NEGATIVE_MARK` (U+200B);
components call `isNegativeMarked()` / `stripNegativeMark()`. Date parts are
labelled by the caller through `datePartLabel(part, n)`; the locale default
is `en-US` (R-PURE forbids `navigator`).

`lib/palette/registry.ts` holds every palette with `kind` (categorical /
sequential / diverging), `labelsRequired` and `validation`; `pick.ts`
resolves the Color shelf: `pickPalette(spec, colorPill, meta)` →
categorical sets assigned in fixed order with name-based mapping for fuel /
zone / ISO-like labels (D-10), a per-field label→color memo so color follows
the entity (rule 7), sequential or diverging ramps for continuous color.
`validate.ts` is the CVD / adjacent-ΔE gate run by `tests` and
`scripts/validate_palette.js`.

## 6. Charts

`lib/charts/registry.ts` maps every `ChartTypeId` to a `ChartDef` `{id,
label, group, icon, requires, channels, renderer:'echarts'|'dom', needs?,
echartsModules, build(ctx)}`; `tests` cross-check `echartsModules` against
what `echarts-setup.ts` registers (D-1). `needsFor(spec)` refines plan needs
by the pills (scatter / bubble / parallel / symbol map disaggregate only
without a grouping dimension; boxplot always asks for box statistics; an
envelope in percentile mode asks for `bands` at `envelopeLevels(spec)` for its
value measure). `PICKER_GROUPS` is the Show Me grid order.

`show-me.ts`: `eligibility(spec, meta)` per type with a reason when unmet,
`suggest(spec, meta)` (filled map when a dimension carries an area geo role →
bar → line → scatter → text table), `arrangeFor(draft, id, meta)` the Tableau
move applied inside one `spec.patch` (`meta` supplies the inferred geo roles
the map moves look for).

v2 builders share three helpers. `option-common.ts` `cartesianModel` pivots
the measures into series with an axis each (`Pill.axis`; combo defaults the
second measure onward to the right axis; when no measure is primary all draw
primary) and `valueAxes` emits `yAxis[1]` from `axes.y2`, copying the primary
range when `axes.synchronized`. `decorations.ts` turns `referenceLines` into
`markLine` / `markArea` (statistics from `lib/data/stats`), `trendLine` into
dashed fitted series (`lib/data/regression`) and `annotations` into
`markPoint` labels, and exposes `annotationAnchors(option)` for the canvas's
drag handles. `map-common.ts` resolves the geographic pills (`geoRoleFor`:
override → inferred → none), picks the layer (`spec.geoLayer`, else the area
role's layer, else `DEFAULT_LATLON_LAYER` for coordinates), joins labels to
regions (`geo.ts`) and draws the five map marks; `geo-loader.ts` fetches a
layer from `public/geo/` once and registers it with ECharts, the builder
returning `__meta.geoPending` until it is there. `style.ts` applies
`StyleSpec` (fonts via `lib/ui/chart/fonts.ts`, title, caption, background,
padding) to every ECharts option.

`spec-builder.ts` `tryBuildOption({spec, result, meta, isMobile, theme})`
returns `{ok, option}` or `{ok:false, error}`; `option.__meta` carries data
notes (folded slices, dropped negatives …) that `ChartCanvas` strips and
toasts once per note. `option-common.ts` holds `classify(spec)`, pill labels,
axis and tooltip formatting and `DEFAULT_THEME`; `ChartCanvas` reads the live
CSS tokens with `getComputedStyle` and passes them as `BuildContext.theme`
(rule 4: ECharts cannot read `var()`).

Rendering: `setOption` with `replaceMerge` on `REPLACE_MERGE_KEYS`; `large` /
`progressive` for scatter > 2K; `sampling:'lttb'` for long lines; animation
off above 5K points or on mobile; tooltips `transitionDuration:0`,
`confine:true`; `ResizeObserver` → rAF resize. `kpi`, `text-table` and
`highlight-table` are DOM renderers (`KpiTile`, `TextTable` with row
windowing above 200 rows, `HighlightTable`).

## 7. State and effects

```
dataset.load(entry, source, initialSpec?) ──► client.load ──► meta, rowCount
        │  (typeOverrides forwarded before inference)
        └──► spec.replace(hash spec ▸ recent spec ▸ default)      (no undo step)

spec.value ──► queryOf(spec, needsFor(spec), limit) ──► queryKey ──► client.query ──► query.result
             (effect keyed on the key string: render-only edits never reach the worker)
spec.value ──► views.persist (300 ms debounce) ──► localStorage recent slot + URL hash (replaceState)
```

- `spec.svelte.ts`: `patch(fn)` clones, mutates, commits one undo step
  (`UNDO_DEPTH` 50); `replace(spec, {history})`; shelf helpers `addPill`,
  `movePill`, `removePill`, `updatePill`, `findPill`. Single-pill shelves
  replace; moving a pill off Filters drops its `FilterSpec`.
- `dataset.svelte.ts`: load state, `setType` (override + re-parse or reload),
  `setGeoRole` (records `typeOverrides[field].geoRole` only when the role in
  force differs — the field menu writes it first — and reflects it into
  `meta`; no worker round trip), `openLocal(file)`; a superseded slow load
  never clobbers the newer one.
- `query.svelte.ts`: `planFor()` / `submit()` are plain functions the
  `$effect` calls; a reply for an older `seq` is dropped; `limit` is
  `QUERY_LIMIT_MOBILE` on phones.
- `views.svelte.ts`: saved views per dataset (`STORAGE_VIEWS`), the recent
  spec (`STORAGE_RECENT`), hash sync through `url-codec.ts`
  (`#v=<base64url(deflate-raw(JSON))>`), `restoreFromHash()` on boot.
- `ui.svelte.ts`: viewport mode, open bottom sheet, tap-to-place selection,
  **the open dialog** (`ui.dialog`, the one home for dialog state), toasts
  (`toast()` reads its list untracked so effects may call it).

Boot (`App.svelte`): `ui.observeViewport()`, `query.start()`, `views.start()`
once; `views.restoreFromHash()` → find the dataset in `data/manifest.json` →
`dataset.load(entry, url, spec)`; otherwise the dataset picker opens.
`pagehide` flushes the pending hash write. A field dropped on a fresh
text-table worksheet switches to the Show Me suggestion (Tableau's
"Automatic" mark); only a drop qualifies (one new pill id, same dataset), so
a loaded view is never overridden. With no pill driving a query a text-table
worksheet shows the first 200 raw rows through `client.rows()`.

## 8. UI and mobile

```
App.svelte
├── TopNav (undo/redo; slots: Dataset button · Views button · ExportMenu)
├── desktop ≥ 900px: .app__body grid 260px | 320px | 1fr
│   ├── FieldPanel  (FieldItem drag sources; field menu: add to shelf, convert, change type, geographic role, format)
│   ├── ShelfPanel  (Shelf × Columns/Rows/Filters + MarksCard; the one drop subscriber; PillMenu)
│   │     MarksCard: chart type, map mark + layer (GeoLayerPicker), envelope mode + bands, Icons… (IconPicker)
│   │     PillMenu: aggregation incl. percentiles, date level, sort, bin, number presets, dual axis / synchronize / combo mark
│   └── chart pane  (title · Show Me toggle · Palette · Format ▾ menu; ChartCanvas; ChartPicker side panel; result footer)
├── phone < 900px: chart pane only + bottom bar → BottomSheet
│   ├── Data   → FieldPanel          (tap a field: arms tap-to-place, opens the Shelves sheet)
│   ├── Shelves→ ShelfPanel showMarks={false}
│   ├── Marks  → ShelfPanel showMain={false} (+ palette button + the Format entries as buttons)
│   └── Chart  → ChartPicker
├── dialogs (ui.dialog): DatasetPicker · SavedViews · FormatDialog · FilterDialog · PaletteDialog (67 palettes by family)
│                        StylePanel (a side panel on desktop, a sheet on phones) · AxisDialog (x / y / y2)
│                        ReferenceLineDialog · TrendLineDialog · AnnotationEditor (opened on a mark click with the anchor)
└── Toast
```

The Format menu (chart head, `Menu`) and the phone Marks sheet list the same
entries: style panel, X / Y (/ secondary Y when a pill is secondary) axis,
reference lines, trend line, annotations; axis and decoration entries are
disabled for DOM renderers. `ChartCanvas` emits `onMarkClick` (→
`ui.openDialog({ kind: 'annotation', target: { kind: 'pending', anchor } })`)
and `onAnnotationDrag` (→ one `spec.patch` of the note's offset); it loads a
map's layer on `__meta.geoPending` and rebuilds, and injects the style
panel's web font once per family. `IconPicker` and `GeoLayerPicker` stay
hosted by `MarksCard` with local open flags (transient UI state, not viz
state).

Drag (`lib/ui/drag/drag-controller.ts`, pure DOM): Pointer Events with
`setPointerCapture`, `touch-action:none` on sources only, a drag starts after
8 px (mouse/pen) or a 180 ms press (touch); zones are hit-tested by rect and
the drop index by `[data-drop-item]` midpoints; a press that never became a
drag is a `tap`, a zone tapped while a selection waits is a `zonetap`
(tap-pill → tap-shelf, D-11). `ShelfPanel` applies `drop-rules.ts` to the
store; the hidden desktop panes stay mounted on phones and ignore events
while `getClientRects()` is empty, so a drop is applied exactly once.
Keyboard: every field and pill has a menu with "Add to / Move to shelf";
Ctrl+Z / Ctrl+Shift+Z undo and redo.

Touch targets are ≥ 44px below 900px; dialogs become bottom sheets there.

## 9. Performance budgets (acceptance criteria, rule 6)

| Budget | Desktop | Phone |
|---|---|---|
| Parse + build, 500K × 12 | ≤ 2.5 s | ≤ 8 s |
| 3-dim group-by on 500K | ≤ 40 ms | ≤ 120 ms |
| Pill drop → re-render | ≤ 100 ms | ≤ 250 ms |
| 100K-point scatter first paint | < 300 ms | — |
| Pan on that scatter | 60 fps | — |
| Mobile caps | — | 1M rows, 20K result groups, 5K axis categories (else require Top N) |

`tests/perf/engine-430k.test.ts` asserts the engine numbers on
`data/datasets/ercot-system-hourly-2019-2025.csv` (`PERF=1 npm run perf`);
`tests/e2e/perf-430k.mjs` measures the same file end to end in Chromium
(load, drop → paint, 3-dim group-by, shell paint; the first drop is `weekday`
so the chart is a bar, since `zone` now opens as a map). Measured numbers are
recorded in `docs/records/<lane>/RESULT-perf-<date>.md` (`s6` for v0.1, `t6`
for v0.2), never pinned into this doc.

## 10. Build, launch, deploy, QA

One `dist/` (`base: './'`, deterministic asset names) serves from
`tools/launcher.py` at `127.0.0.1:8766` (with `data/` overlaid, manifest
regenerated on start, `GET /api/manifest`) and from GitHub Pages
(`deploy-pages.yml` builds and copies `data/` beside it). `dist/` is committed
and written on `main` only by `build-dist.yml` (rule 11); the catalog lives at
`data/`, outside Vite's `public/`, so it never enters `dist/`.

`tests/e2e/smoke.mjs` is the browser smoke test: it builds nothing, starts the
launcher on a spare port (or uses `E2E_BASE_URL`), drives the built `dist/`
in the pre-installed Chromium at 1280×800 and 390×844 (pick the 2024 file,
drop `zone` and `price_usd_mwh` with synthetic pointer events → the Automatic
filled map, line → heatmap → treemap, hash round-trip, CSV export, saved
view; then the v0.2 pass: filled map of AVG(price) by zone with the bubble
and symbol marks, envelope by HOUR(timestamp) in percentile mode with a band
toggled, combo with a dual axis and synchronized axes, a line with an average
reference line and a linear trend line, a font change in the style panel and
gridlines off in the axis dialog, an annotation added by clicking a bar, and
a symbol map with power-gen icons from `tests/fixtures/plants.csv` opened
from the device on the ERCOT zones layer) and fails on any console error or
any chart hint (an eligibility reason or a builder error) where a canvas was
expected. It is run by hand after `npm run build`, not by `npm test` or CI.
