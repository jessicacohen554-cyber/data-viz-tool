> Status: ACTIVE — the chart library (plan §7). The registry `src/lib/charts/registry.ts` must list exactly these ids; `/sync-docs` reconciles.

# Charts

39 chart types: the 33 of v0.1 and six added in v0.2 (`area-stacked`,
`area-100`, `combo`, `envelope`, `map-choropleth`, `map-symbol`; D-13, D-15,
D-19). **D** = discrete dimension pill, **M** = measure pill,
**T** = date pill, **C** = continuous pill (a `trunc` date or a measure on an
axis). "Minimum shelves" is `ChartDef.requires`; "Channels" is
`ChartDef.channels` (which Marks-card shelves the type honours — a pill on an
unlisted channel is ignored with a toast). "Transform" names the function in
`src/lib/charts/transforms.ts` applied to the `QueryResult` before the option
is built. Every ECharts type is registered through `echarts/core` in
`echarts-setup.ts` from the `echartsModules` each `ChartDef` declares (a test
cross-checks the two lists). `renderer: 'dom'` types are Svelte components in
`src/lib/ui/chart/`.

## 1. The 39 types

| # | `id` | Label | Group | ECharts series | Minimum shelves | Channels honoured | Transform | Notes / edge cases |
|---|---|---|---|---|---|---|---|---|
| 1 | `bar` | Bar | Bars | `bar` | 1 D + 1 M (D on Columns, M on Rows) | color, size, label, detail, tooltip | `pivot` when a color D is present (side-by-side, `barGap`) | > 5K categories on an axis → Top N required (mobile cap); nulls in M → no bar |
| 2 | `bar-h` | Horizontal bar | Bars | `bar` | 1 D + 1 M (M on Columns, D on Rows) | color, size, label, detail, tooltip | `pivot` | same as `bar`, axes swapped; long labels truncated with full-name tooltip |
| 3 | `bar-grouped` | Grouped bar | Bars | `bar` | 1 D + 1 M + color D | color, label, detail, tooltip | `pivot` (one series per color value, `barGap: '10%'`) | color D > 12 values → "use with labels" note; missing combination → gap, not zero |
| 4 | `bar-stacked` | Stacked bar | Bars | `bar` (`stack`) | 1 D + 1 M + color D | color, label, detail, tooltip | `pivot`, `stack` | negatives stack below zero (ECharts default); stacking order = palette order (rule 7, never re-sorted by value) |
| 5 | `bar-stacked-100` | 100% stacked bar | Bars | `bar` (`stack`) | 1 D + 1 M + color D | color, label, detail, tooltip | `pivot`, `percentStack` | a category whose total is 0 or null → empty column; negative values are excluded from the denominator with a toast |
| 6 | `line` | Line | Lines | `line` | 1 C/T + 1 M (C on Columns) | color, size (line width), label, detail, tooltip | `sortByX`; `lttb` sampling above 2K points per series | `marks.nullHandling`: `break` (default) \| `connect` \| `zero`; discrete T → one point per part, straight segments |
| 7 | `area` | Area | Lines | `line` (`areaStyle`, `stack`) | 1 C/T + 1 M (+ color D) | color, label, detail, tooltip | `pivot`, `stack`, `lttb` | stacked by default (`marks.stacking: 'stack'`); `'none'` overlays with `marks.opacity` 0.5 |
| 8 | `streamgraph` | Streamgraph | Lines | `themeRiver` | 1 T + 1 M + color D | color, tooltip | `pivot` → `[date, value, name]` triples | needs ≥ 3 x values; `trunc` dates only (parts are rejected with "Needs a continuous date") |
| 9 | `scatter` | Scatter | Points | `scatter` (`large` above 2K) | 2 M (Columns, Rows); disaggregated unless a D is on Detail | color, size, shape (≤ 10), label, detail, tooltip | `disaggregate` or group by Detail | `progressive` 4000; animation off > 5K; mobile cap 20K points → "add a dimension to Detail or a Top N" |
| 10 | `bubble` | Bubble | Points | `scatter` | 2 M + size M | color, size, label, detail, tooltip | as `scatter`; size → `symbolSize` by sqrt scale within `marks.sizeRange` | negative size values → smallest size with a toast |
| 11 | `pie` | Pie | Parts of whole | `pie` | 1 D (color) + 1 M (size = angle) | color, label, tooltip | `sortByValue` unless `sort` is manual | > 12 slices → the rest folded into "Other" (`--border` gray) with a toast; negative values dropped |
| 12 | `donut` | Donut | Parts of whole | `pie` (`radius: ['55%','80%']`) | 1 D + 1 M | color, label, tooltip | as `pie` | the total is shown in the hole, formatted by the measure's `FormatSpec` |
| 13 | `funnel` | Funnel | Parts of whole | `funnel` | 1 D + 1 M | color, label, tooltip | `sortByValue` desc (`sort: 'descending'`) | stage order = the D's `sort` when manual |
| 14 | `gauge` | Gauge | Parts of whole | `gauge` | 1 M (no D) | label, tooltip | single value; `axes.y.domain` or `[0, max]` | a second M becomes the target tick; domain `'auto'` = `[0, 1.1·value]` rounded |
| 15 | `treemap` | Treemap | Hierarchy | `treemap` | ≥ 1 D + 1 M | color (D = top level, or M gradient), label, tooltip | `toTree` over the D pills in shelf order | zero/negative sizes dropped; depth > 4 → "add fewer levels" note; `leafDepth` 1 with drill-down |
| 16 | `sunburst` | Sunburst | Hierarchy | `sunburst` | ≥ 2 D + 1 M | color, label, tooltip | `toTree` | ring order = shelf order (Columns then Rows then Detail) |
| 17 | `heatmap` | Heatmap | Grid | `heatmap` + `visualMap` | 2 D (Columns, Rows) + 1 M (color) | color (the M), label, tooltip | `grid` (dense matrix, nulls → empty cell) | > 5K cells on mobile → Top N; sequential ramp, diverging when the user asks or the domain spans zero |
| 18 | `calendar-heatmap` | Calendar | Grid | `heatmap` on `calendar` coordinate | 1 T at level `day` + 1 M | color, tooltip | `grid` keyed by `yyyy-MM-dd` | one calendar per year present; Feb 29 cells exist only in real leap years (ERCOT 2024 is missing it — rendered empty, not zero) |
| 19 | `highlight-table` | Highlight table | Grid | DOM table (`renderer: 'dom'`) | ≥ 1 D + 1 M (2 D for a matrix) | color (cell background from the M), label, tooltip | `grid` | text uses the WCAG-safe contrast rule (dark text on light cells, white on dark); virtualised > 200 rows |
| 20 | `histogram` | Histogram | Distribution | `bar` | 1 M, binned (`Pill.bin`, default `{count: 20}`) | color (D → stacked bins), label, tooltip | bins in the worker (`QueryPlan.dims[].bin`) | empty bins kept (zero-height); `barGap: 0`; `bin.size` user-set overrides count |
| 21 | `boxplot` | Box plot | Distribution | `boxplot` (+ `scatter` outliers) | 1 M (+ D on Columns) | color, tooltip | `boxstats` in the worker (`QueryResult.boxstats`): q1, median, q3, whiskers at 1.5·IQR, outliers | > 1K outliers per box → sampled, noted in tooltip |
| 22 | `waterfall` | Waterfall | Comparison | `bar` ×2 (transparent base + delta) | 1 D + 1 M | color (fixed: positive `--positive`, negative `--negative`, total `--navy`), label, tooltip | `runningTotal` in D's sort order; a trailing "Total" bar | D order is the story: default `source` order, never alphabetic |
| 23 | `bullet` | Bullet | Comparison | `bar` composite (bands + measure + target `markLine`) | 1 D + 1 M (+ target M) | color (bands fixed grays), label, tooltip | `bands` (60/80/100% of target, or of max when no target) | horizontal always; second M = target |
| 24 | `lollipop` | Lollipop | Comparison | `bar` (thin) + `scatter` (head) | 1 D + 1 M | color, size (head), label, tooltip | none | zero-width stems below ~2px rendered as 2px |
| 25 | `dumbbell` | Dumbbell | Comparison | `custom` (segment) + `scatter` ×2 | 1 D + 2 M | color (the two ends, `pairs` palette), label, tooltip | `pairs` (one row per D: [m1, m2]) | default palette `pairs-amber-indigo` (`PALETTES.md` §4); null end → single dot |
| 26 | `radar` | Radar | Multivariate | `radar` | 1 D (series) + ≥ 3 M (axes) | color, tooltip | `pivot` (one polygon per D value; axis per M, each with its own max) | D > 8 values → labels required; M count 1–2 → "Needs 3 measures" |
| 27 | `parallel` | Parallel coordinates | Multivariate | `parallel` | ≥ 2 M (+ color D) | color, tooltip | `disaggregate` or group by Detail | mobile cap 20K lines; `lineStyle.opacity` 0.4; axis order = shelf order |
| 28 | `sankey` | Sankey | Flow | `sankey` | ≥ 2 D + 1 M | color (nodes by palette), label, tooltip | `adjacentLinks` (D₁→D₂, D₂→D₃ …, weight = M) | cycles (same label in two levels) are disambiguated by level prefix; negative weights dropped |
| 29 | `slope` | Slope | Rank / change | `line` | 1 D with exactly 2 values on Columns + 1 M + color D | color, label, tooltip | `pivot` to two x positions | the 2-value check names the offending D ("`year` has 7 values; needs 2 — add a filter") |
| 30 | `bump` | Bump | Rank / change | `line` (`smooth`) | 1 T + 1 M + color D | color, label, tooltip | `rankPerX` (rank of M per x, inverted y axis) | ties broken by palette order (stable); gaps where a color value is absent at an x |
| 31 | `candlestick` | Candlestick | Finance | `candlestick` | 1 T + 4 M **in order** open, close, low, high | color (fixed up/down), tooltip | `ohlc` (pill order validated; `low ≤ open,close ≤ high` violations → toast, row dropped) | rising `--positive`, falling `--negative`; `dataZoom` inside |
| 32 | `kpi` | KPI tile | Text | DOM (`renderer: 'dom'`) | 1 M | label (secondary M as delta), tooltip | none | formatted by the M's `FormatSpec`, `automatic` with units `auto`; delta colored by sign |
| 33 | `text-table` | Text table | Text | DOM (`renderer: 'dom'`) | any (0 D and 0 M allowed → the raw first 200 rows) | label (which measures to show), tooltip | `grid`; virtualised above 200 rows | numbers right-aligned mono; row header per D; column per M; CSV export is this table |
| 34 | `area-stacked` | Stacked area | Lines | `line` (`areaStyle`, `stack`) | 1 C/T + 1 M (+ color D, or several M) | color, label, detail, tooltip | `pivot`, `stack`, `lttb` | always stacked whatever `marks.stacking` says; several M on Rows → one series per M (Color not applied, toast) |
| 35 | `area-100` | 100% stacked area | Lines | `line` (`areaStyle`, `stack`) | 1 C/T + 1 M + color D (or several M) | color, label, detail, tooltip | `pivot`, `percentStack`, `lttb` | y axis fixed 0–100 %; negatives excluded from the denominator with a toast (`__meta.excludedNegatives`) |
| 36 | `combo` | Combo (bar + line) | Lines | `bar` + `line` (two `yAxis`) | 1 D/T + ≥ 1 M on Rows | color (one M only), label, detail, tooltip | `cartesianModel` (one series per M) | `marks.markByAxis` picks bar / line / area per axis (default bar left, line right); M without `Pill.axis`: the first is primary, the rest secondary; a trunc date draws as categories so bars keep width |
| 37 | `envelope` | Envelope | Distribution | `line` ×(2 per band + 1) | 1 C/T on Columns + 1 M (percentile mode) or low + high (+ mid) M (columns mode) | color (hue), tooltip | `percentile`: `result.bands`; `columns`: the pills | nested bands as a transparent base + filled span on their own stack, outer band lightest; legend lists the levels (`P5–P95`, `P25–P75`, median); percentile mode without `result.bands` fails naming `QueryPlan.bands` (see §9) |
| 38 | `map-choropleth` | Filled map | Maps | `map` (+ `visualMap`) | 1 D with an area geo role (or `spec.geoLayer`) + 0–1 M | color (the M), label, detail, tooltip | `joinRegions` | regions keyed by the layer's `keyProps` (name / code / fips / zone, best match wins → `nameProperty`); unmatched values in `__meta.unmatched` (toast); `marks.mapMark` `label` draws names instead of a fill |
| 39 | `map-symbol` | Symbol map | Maps | `scatter` / `effectScatter` / `heatmap` on `geo` | lat + lon M, or 1 area-role D (centroids) | color (D → series, M → gradient), size, shape (icons), label, detail, tooltip | `centroid` per matched region | `marks.mapMark` `symbol` (default) \| `bubble` (default with a Size pill, sqrt scale in `sizeRange`) \| `heat`; `marks.extra.ripple` → `effectScatter`; rows without a location counted in `__meta.unplaced`; disaggregated unless a D groups the marks |

### Group order in the picker

Bars → Lines → Points → Parts of whole → Hierarchy → Grid → Distribution →
Comparison → Multivariate → Flow → Rank / change → Finance → Maps → Text.

### Common behaviour (every type)

- Nulls in a measure never draw a mark (`marks.nullHandling` applies to lines
  and areas only).
- `marks.labels.show` draws the M formatted by its `FormatSpec`; `position`
  per type default (`top` for bars, `right` for horizontal, `inside` for
  pie/treemap).
- `marks.opacity`, `lineWidth`, `smooth`, `showPoints`, `barGap` map to the
  ECharts option in `option-common.ts`; `marks.extra` is a per-type escape
  hatch read only by that type's builder.
- Animation is off above 5K points or on mobile; tooltips
  `transitionDuration: 0`, `confine: true`.
- Every ECharts option passes through the style pass (§6) and, for the
  cartesian families, the decorations (§5); the bar and line families take
  every measure on the value shelf and honour `Pill.axis` (§4).

## 2. Show Me priority

`suggest()` runs after a drop when the user has not pinned a chart type:

1. `map-choropleth` — if a D carries an area geo role assigned by inference
   or the user (`FieldMeta.geoRole` / `typeOverrides`; the name fallback of
   §7 never suggests) and ≥ 1 M
2. `bar` — if ≥ 1 D and ≥ 1 M
3. `line` — if a T (or continuous C) is on Columns or Rows and ≥ 1 M
4. `scatter` — if ≥ 2 M and 0 D
5. `text-table` — otherwise (including 0 M)

Eligibility rules the v2 types add (`Requirement.exact`): `envelope` needs a
date or continuous field on Columns plus one measure, or low and high
measures on Rows in `columns` mode; the maps need a dimension with an area geo
role (role, override, name fallback or an explicit `spec.geoLayer`), or
latitude + longitude measures.

Within the picker, eligible types are ordered by the group order above; the
suggested type is marked "Recommended".

## 3. Pill rearrangement on type switch (Tableau's Show Me move)

One `spec-store.patch`; pills not placed go to `detail`. D₁, D₂ are the
dimension pills in current shelf order (Columns, Rows, Color, Detail);
M₁… the measures; T the first date pill.

| Target type | Columns | Rows | Color | Size | Other |
|---|---|---|---|---|---|
| `bar`, `lollipop`, `waterfall`, `bullet` | D₁ | M₁ | D₂ (if any) | — | bullet: M₂ → target |
| `bar-h` | M₁ | D₁ | D₂ | — | |
| `bar-grouped`, `bar-stacked`, `bar-stacked-100` | D₁ | M₁ | D₂ (required) | — | |
| `line`, `area`, `area-stacked`, `area-100`, `bump`, `candlestick` | T (or C) | M₁ (candlestick: M₁–M₄) | D₁ | — | `line` with no T → first C |
| `combo` | T (or D₁) | M₁, M₂… (M₂… get `axis: 'secondary'` unless set) | D₂ | — | |
| `envelope` | T (or D₁) | M₁ (percentile) or M₁, M₂, M₃ = low, high, mid | — | — | |
| `map-choropleth` | geo D (by name; else D₁) | — | M₁ | — | other D → Detail |
| `map-symbol` | geo D, else the longitude M | the latitude M | D (not geo) | first non-coordinate M | |
| `streamgraph` | T | M₁ | D₁ | — | |
| `scatter`, `bubble`, `parallel` | M₁ | M₂ | D₁ | M₃ (bubble) | parallel: all M stay as axes (Columns) |
| `pie`, `donut`, `funnel` | — | — | D₁ | M₁ | |
| `gauge`, `kpi` | — | — | — | — | M₁ → Label |
| `treemap`, `sunburst` | — | — | D₁ | M₁ | D₂… → Detail (hierarchy order kept) |
| `heatmap`, `highlight-table` | D₁ | D₂ | M₁ | — | |
| `calendar-heatmap` | T (set to `day`, `trunc`) | — | M₁ | — | |
| `histogram` | M₁ (binned) | — | D₁ | — | row count is the y measure |
| `boxplot` | D₁ | M₁ (`none`) | — | — | |
| `dumbbell`, `slope` | D₁ | M₁ (dumbbell: M₁, M₂) | D₂ (slope) | — | |
| `radar` | — | M₁… | D₁ | — | |
| `sankey` | D₁, D₂… | — | — | M₁ | |
| `text-table` | — | D₁, D₂… | — | — | M₁… → Label |

## 4. Dual axis (D-19)

The bar family (`bar`, `bar-h`, `bar-grouped`, `bar-stacked`,
`bar-stacked-100`, `histogram`), the line family (`line`, `area`,
`area-stacked`, `area-100`) and `combo` build from `cartesianModel()` in
`option-common.ts`:

- One measure on the value shelf → pivoted by the Color dimension (one series
  per color label), as in v0.1.
- Several measures → one series per measure named `AGG(field)`; the Color
  dimension is not applied (`__meta.colorIgnored`, toast).
- A measure pill with `axis: 'secondary'` draws on `yAxis[1]` (right side; a
  second `xAxis` on top for `bar-h`), styled from `axes.y2` (gridlines, log,
  reversed, min/max, title, tick format). Its series name carries
  ` (right)` so legend and tooltip name the axis. Stacks are per axis
  (`total` / `total-secondary`).
- `axes.synchronized` copies the primary data extent (rounded outwards to a
  half-decade step, zero included) onto both axes unless the spec pins a
  numeric min/max on that axis.

`combo` defaults a measure without `axis` to primary for the first and
secondary for the rest; the other families default every measure to primary.
`scatter`, `bubble` and the one-off builders (lollipop, waterfall, bullet,
dumbbell, radar, …) have no secondary axis.

## 5. Decorations (D-16): reference lines, trend lines, annotations

`decorations.ts` turns the spec's `referenceLines`, `trendLine` and
`annotations` into mark fragments on the series a cartesian builder already
has (bars, lines, combo, scatter and bubble; not the rank-inverted `bump`).

| Spec | ECharts | Rules |
|---|---|---|
| `ReferenceLine` kind `constant` / `average` / `median` / `min` / `max` / `percentile` | `markLine` item on the first series of the target axis (`y` primary, `y2` secondary, `x`) | statistics from `summary()` over the pooled values of that axis (`scope: 'all'`) or each series (`per-series`, one line per series); label `Avg 37.5`, `P90 …`, or `label`; `dash` → dashed; `color` or `--text-muted` |
| kind `band` | `markArea` from `from` to `to` (constants or `min` / `average` / `median` / `p25` / `max` / `p75`) | 8 % fill of the line color |
| `axis: 'x'` on a category axis | constant only (names a category or its index) | a statistic there has no numeric sample and is skipped with a note (`__meta.notes`) |
| `TrendLine` | one dashed `line` series per data series (`<name> trend`), or one `All trend` when `perSeries` is false | `fit(xs, ys, model, degree)`; x = category index, days since the first point (time axes) or the raw value (scatter, 50 sampled points); trend series are kept out of the legend; the tooltip shows `y = … · R² 0.987` when `showEquation`, nothing otherwise |
| `Annotation` | `markPoint` (small navy dot) at `[x, y]` on the series named by `seriesKey` (else the first), with the text as label at `offset` | `y` defaults to the series value at `x`; a note whose `x` is not in the result is skipped with a note; anchors are exposed in `__meta.annotations` |

`ChartCanvas` lays a transparent draggable handle over each annotation
label (graphic ids `ann:<id>`) and, when the drag ends, emits
`onAnnotationDrag(id, offset)`; the label itself moves when the spec patch
re-renders. A click on any series mark emits
`onMarkClick({ x, y, seriesKey, pixel })` (`src/lib/ui/chart/events.ts`).

## 6. Style (D-14, D-16)

`style.ts` runs after every ECharts builder (`buildOption` →
`applyStyle`) and the builders read `styleFonts()` for their own sizes:

- `fontFamily` (ids of `FONT_FAMILIES`; `inherit` = the app font) on the root
  text style, axes, legend, visualMap and tooltip; `axis.fontFamily`,
  `labels.fontFamily`, `legend.fontFamily` override per part (series labels
  stay in the mono token unless `labels.fontFamily` is set). `fonts.ts`
  (`lib/ui/chart`) injects the Google Fonts `<link>` once per family;
  families without a `google` spec are system stacks and need no request.
- `fontScale` multiplies every size (`axis.size`, `axis.titleSize`,
  `labels.size`, `legend.size`, title/subtitle/caption).
- `title.text` / `subtitle.text` draw an ECharts `title` (align left or
  center, weight from `title.weight`); `caption.text` is a muted `graphic`
  text bottom-left; the grid moves to make room. The sheet title in
  `spec.title` stays in the app header.
- `background` (`transparent` by default so the card shows through),
  `border` (drawn by the canvas from `--border`, `__meta.border`),
  `padding` (shifts every grid side by its difference from the v1 default 16).
- `axes.x/y/y2`: `gridlines` off removes `splitLine`; `showAxis`, `title`
  (`null` hides it), `min`/`max`, `log`, `reversed`, `tickFormat` apply to
  value axes; category axes never draw split lines.

## 7. Maps (D-13, D-17)

Layers are the GeoJSON files of `public/geo/index.json` (`us-states`,
`world-countries`, `us-counties`, `ercot-zones`; provenance in
`public/geo/README.md`). `geo-loader.ts` fetches a layer once from
`import.meta.env.BASE_URL + 'geo/<file>'`, calls `echarts.registerMap` and
keeps it in a synchronous cache; a builder that finds its layer missing
returns an empty option with `__meta.geoPending`, the canvas loads the layer
and rebuilds. `geo.ts` holds the pure join and centroid helpers.

**Geographic role of a field** (`map-common.ts` `geoRoleFor`): the user's
`typeOverrides[field].geoRole`, else `FieldMeta.geoRole`, else — only while
inference has not spoken (`geoRole === undefined`) — a whole-word name
fallback (`zone` → `ercot-zone`, `state` → `us-state`, `county`,
`country`/`iso_a3`, `lat`/`latitude`, `lon`/`lng`/`longitude`). `null` from
inference means "none" and is respected. The layer is `spec.geoLayer`, else
`GEO_LAYER_FOR_ROLE[role]`.

**Join** (`joinRegions`): every `keyProps` property of the layer is tried
against the distinct labels after `normalizeKey` (trim, lower-case,
`_`/`-`/spaces collapsed, leading zeros dropped from digit codes); the
property matching the most labels wins and becomes the map series'
`nameProperty`. Unmatched labels go to `__meta.unmatched` (toast).

| `marks.mapMark` | Series | Position | Encodings |
|---|---|---|---|
| `fill` (default of `map-choropleth`) | `map` | matched regions | color: the Color measure (else the first) through `visualMap`; regions without data keep `--chart-grid` |
| `label` | `map` with labels | matched regions | region label (+ value when a measure is present); no fill scale |
| `symbol` (default of `map-symbol`) | `scatter` on `geo` (`effectScatter` when `marks.extra.ripple`) | lat/lon measures, else region centroids (area-weighted over outer rings) | color: Color dimension → one series per label, Color measure → gradient on the point; shape: Shape shelf icons (§8); size: `sizeRange[0]` or the icon size |
| `bubble` (default when a Size pill is present) | `scatter` on `geo` | as `symbol` | size: sqrt scale of the Size measure (else the color measure) within `sizeRange` |
| `heat` | `heatmap` on `geo` | as `symbol` | `[lon, lat, value]` with `visualMap` |

Latitude/longitude with no dimension disaggregate the query (one point per
row, `needs.disaggregate`); with a dimension on Detail the coordinates are
aggregated per group (use AVG). Rows without a location count in
`__meta.unplaced`.

## 8. Shape shelf → icons (ICONS.md §7)

`shapes.ts` resolves the Shape pill's labels with `iconsFor(set, labels,
marks.shapeOverrides)` over `marks.shapeSet` (default `basic`) and gives
`symbol: 'path://…'` per label. On `scatter`/`bubble` and the symbol map:
with no Color dimension (or the same field on Color and Shape) there is one
series per shape label so the legend shows the icon; otherwise the series stay
by color and the icon is chosen per point. Icons draw at 12 px for
`smallSafe` sets and 16 px otherwise (never below `sizeRange[0]`); `large`
rendering is off when icons are in use.

## 9. Seams left for the integrator (T2 report)

- **Percentile bands.** `envelope` reads `QueryResult.bands` in
  `envelopeLevels(spec)` order (each band's low and high, outer first, then 50)
  but `ChartNeeds` (`src/lib/core/query-of.ts`) has no way to ask for them:
  add `bands?: { levels: number[] }`, let `queryOf` emit
  `plan.bands = { measureKey: measures[0].key, levels }`, and have
  `needsFor` pass `envelopeLevels(spec)` when `spec.envelope?.mode !==
  'columns'`. Until then percentile mode fails with a message naming
  `QueryPlan.bands`; `columns` mode works today.
- **`stats-shim.ts`.** `fit()` and `summary()` with T1's signatures; swap the
  two imports in `decorations.ts` to `../data/regression` and
  `../data/stats` when they land and delete the shim.
- **Geo role inference.** The name fallback in `map-common.ts` exists only
  until `FieldMeta.geoRole` is written by inference; delete it then.
- **Dirty-rect repainting is off.** `ChartCanvas` now inits ECharts with
  `useDirtyRect: false` (the ECharts default): with it on, the first animated
  paint of a chart with a `markPoint` label, and of geo scatter symbols after
  the layer loads, left un-repainted holes (verified in the dev smoke; any
  later `setOption` repainted them). Hover and animation repaint the full
  canvas, which the §9 budgets do not measure.
