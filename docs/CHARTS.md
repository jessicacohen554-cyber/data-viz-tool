> Status: ACTIVE — the chart library (plan §7). The registry `src/lib/charts/registry.ts` must list exactly these ids; `/sync-docs` reconciles.

# Charts

33 chart types. **D** = discrete dimension pill, **M** = measure pill,
**T** = date pill, **C** = continuous pill (a `trunc` date or a measure on an
axis). "Minimum shelves" is `ChartDef.requires`; "Channels" is
`ChartDef.channels` (which Marks-card shelves the type honours — a pill on an
unlisted channel is ignored with a toast). "Transform" names the function in
`src/lib/charts/transforms.ts` applied to the `QueryResult` before the option
is built. Every ECharts type is registered through `echarts/core` in
`echarts-setup.ts` from the `echartsModules` each `ChartDef` declares (a test
cross-checks the two lists). `renderer: 'dom'` types are Svelte components in
`src/lib/ui/chart/`.

## 1. The 33 types

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

### Group order in the picker

Bars → Lines → Points → Parts of whole → Hierarchy → Grid → Distribution →
Comparison → Multivariate → Flow → Rank / change → Finance → Text.

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

## 2. Show Me priority

`suggest()` runs after a drop when the user has not pinned a chart type:

1. `bar` — if ≥ 1 D and ≥ 1 M
2. `line` — if a T (or continuous C) is on Columns or Rows and ≥ 1 M
3. `scatter` — if ≥ 2 M and 0 D
4. `text-table` — otherwise (including 0 M)

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
| `line`, `area`, `bump`, `candlestick` | T (or C) | M₁ (candlestick: M₁–M₄) | D₁ | — | `line` with no T → first C |
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
