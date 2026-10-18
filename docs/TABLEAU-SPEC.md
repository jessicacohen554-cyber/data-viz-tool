> Status: ACTIVE — the Tableau semantics this app replicates (rule 5 `[R-TABLEAU]`). A deviation is added to §10 before it is coded.

# Tableau semantics

What "behaves like Tableau" means here, precisely enough to code and test
against. Field names in `code` are the contract's (`src/lib/core/types.ts`).
Where Tableau's behaviour is locale- or version-dependent, the choice made here
is stated and, when it differs from Tableau Desktop (en-US), listed in §10.

## 1. Data types and inference

### 1.1 Types and pill icons

| `DataType` | Tableau name | Pill icon | Storage (`FieldMeta.storage`) |
|---|---|---|---|
| `string` | String | `Abc` | `dict` (Int32 codes + sorted dictionary) |
| `integer` | Number (whole) | `#` | `i32` |
| `number` | Number (decimal) | `#` | `f64` |
| `date` | Date | calendar | `date` (epoch ms, Float64) |
| `datetime` | Date & Time | calendar-clock | `date` |
| `boolean` | Boolean | `T\|F` | `bool` (Uint8) |

No Geographic type (§10). A field's type and role can be changed from the
pill menu; the override lives in `VizSpec.typeOverrides[field]` and re-parses
the column in the worker (parse failures become null and are counted in
`FieldMeta.parseErrors`).

### 1.2 Inference

Runs in the worker on a **sample of the first 5,000 non-empty rows** of the
file (`FieldMeta.confidence` = share of sampled non-null values the winning
type parsed; 1.0 when inferred by the rules below). Null tokens are stripped
first; a type wins only if **every** sampled non-null value parses. Types are
tried in this order; the first that wins is the type:

| Order | Type | Rule on the sampled non-null values |
|---|---|---|
| 1 | `boolean` | all in `{true, false, t, f, yes, no, y, n}` case-insensitive. `0`/`1` columns stay numeric (Tableau also reads them as numbers) |
| 2 | `integer` | all match `^[+-]?\d+$` and every \|v\| < 2³¹ (fits `Int32Array`) |
| 3 | `number` | all match `^[+-]?(\d+\.?\d*\|\.\d+)([eE][+-]?\d+)?$`. Thousands separators, currency signs and `%` are **not** stripped: `1,234` is a string (re-export the CSV or override the type) |
| 4 | `datetime` / `date` | all parse by one pattern from the candidate list below; `datetime` when the winning pattern has a time part, else `date` |
| 5 | `string` | otherwise |

**Null tokens** (case-insensitive, after trimming): empty, `NULL`, `NA`,
`N/A`, `NaN`, `#N/A`. They are null for every type and count in
`FieldMeta.nullCount`. (Tableau treats only the empty cell as null — §10.)

**Date candidate patterns**, tried in this order; the first pattern that
parses every sampled value wins and is stored in `FieldMeta.dateFormat`
(tokens as in §8.2). Separators `-`, `/`, `.` and ` ` are tried per pattern:

| # | Pattern | Example | Notes |
|---|---|---|---|
| 1 | `yyyy-MM-ddTHH:mm:ss.SSSZ` | `2024-02-05T14:07:09.000Z` | ISO 8601 with optional fraction and `Z` or `±HH:mm` |
| 2 | `yyyy-MM-ddTHH:mm:ss` | `2024-02-05T14:07:09` | ISO, naive |
| 3 | `yyyy-MM-dd HH:mm:ss` | `2024-02-05 14:07:09` | optional `.SSS` |
| 4 | `yyyy-MM-dd HH:mm` | `2024-02-05 14:07` | |
| 4a | `yyyy-MM-dd'T'HH:mm` | `2024-02-05T14:07` | ISO without seconds (the ERCOT hourly `timestamp`); added by S1, recorded by S6 |
| 5 | `yyyy-MM-dd` | `2024-02-05` | the ERCOT daily file |
| 6 | `yyyyMMdd` | `20240205` | only when every value is 8 digits **and** a valid date (else integer wins at step 2, so this fires only after a type override) |
| 7 | `MM/dd/yyyy HH:mm:ss` | `02/05/2024 14:07:09` | `M/d` single digits accepted; D/M rule below |
| 8 | `MM/dd/yyyy HH:mm` | `02/05/2024 14:07` | |
| 9 | `MM/dd/yyyy` | `02/05/2024`, `2/5/2024` | D/M rule below |
| 10 | `dd-MMM-yyyy` | `05-Feb-2024` | English month abbreviations only |
| 11 | `MMM d, yyyy` | `Feb 5, 2024` | |
| 12 | `MMMM d, yyyy` | `February 5, 2024` | |
| 13 | `yyyy-MM` | `2024-02` | day = 1 |
| 14 | `HH:mm:ss` | `14:07:09` | time of day → `datetime` on 1970-01-01 (§10) |

**D/M ambiguity rule** (patterns 7–9): the first and second numeric fields are
read as month/day (`M/d`, Tableau's en-US default). If any sampled value has a
first field > 12 the pattern is `d/M`; if any has a second field > 12 it is
`M/d`; if both occur the pattern fails. If neither occurs
`FieldMeta.dateAmbiguous = true`, the field menu shows a one-click
"Day/Month ↔ Month/Day" toggle, and the toggle writes
`typeOverrides[field].dateFormat`.

**Time zone.** Naive timestamps are stored as if UTC and never shifted; a
zone-suffixed value (pattern 1) is converted to UTC. All date parts (§4) are
computed in UTC, so a file renders identically on every device.

**Two-digit years** are not inferred (`yy` is accepted only in an explicit
override pattern; 00–68 → 2000–2068, 69–99 → 1969–1999, as Tableau).

### 1.3 Field metadata shown in the data pane

`rowCount`, `nullCount`, `cardinality` (distinct non-null; `highCardinality`
when > 5,000 or > 50% of rows), `min`/`max` (numbers and dates), `topValues`
(the `TOP_VALUES_LIMIT` = 20 most frequent `[label, count]`; code wins over
the 10 this section first said, R-TRUTH), `parseErrors`.

## 2. Roles

| `DataType` | Default `role` | Default `continuity` | Default `aggregation` | Aggregations allowed when used as a measure |
|---|---|---|---|---|
| `integer`, `number` | `measure` | `continuous` | `sum` | all of §3 |
| `string` | `dimension` | `discrete` | `count` | `count`, `countd`, `min`, `max` |
| `date`, `datetime` | `dimension` | `discrete` (`part`, level `year`) | `count` | `count`, `countd`, `min`, `max` |
| `boolean` | `dimension` | `discrete` | `count` | `count`, `countd` |

A role is overridable per field (`typeOverrides[field].role`): the ERCOT
columns `year`, `month`, `day`, `hour_of_day` infer as measures and are
switched to dimensions from the field menu; `zone` as a measure is
`COUNT(zone)`. A pill copies the field's defaults when created and keeps its
own `role` / `continuity` / `aggregation` afterwards (`Pill` is per shelf
instance).

## 3. Aggregations and null semantics

`Aggregation = 'sum'|'avg'|'min'|'max'|'count'|'countd'|'median'|'stdev'|'var'|'none'`.
**Nulls are ignored by every aggregation**; the group's non-null values are
the input. For an empty input (all null):

| Aggregation | Tableau label | Definition | Empty input |
|---|---|---|---|
| `sum` | SUM | Σ v | null |
| `avg` | AVG | Σ v / n | null |
| `min`, `max` | MIN, MAX | extreme; strings compare by dictionary order, dates by epoch | null |
| `count` | COUNT | n = number of **non-null** values | 0 |
| `countd` | COUNT(D) | number of **distinct non-null** values | 0 |
| `median` | MEDIAN | middle value; for even n the mean of the two middle values | null |
| `stdev` | STDEV | sample standard deviation, n − 1 denominator (Tableau STDEV); n = 1 → null | null |
| `var` | VAR | sample variance, n − 1 | null |
| `none` | (Disaggregate) | one mark per row; only when every measure pill is `none` | — |

Not shipped (§10): ATTR, population STDEVP/VARP, percentile.

Disaggregation (`QueryPlan.disaggregate`) returns row-level values, capped by
the mobile result cap (20K groups → "Top N required" message).

## 4. Discrete vs continuous, dates and bins

### 4.1 What continuity does

| Pill on | `discrete` (blue tint) | `continuous` (green tint) |
|---|---|---|
| Columns / Rows | a **header** band: one row/column per distinct value, in `sort` order; nested headers for several discrete pills | an **axis**: numeric or time, zero-based for measures unless `axes.x/y.zero` is off |
| Color | categorical legend, one swatch per value (`PALETTES.md` §4) | gradient legend (`visualMap`), sequential or diverging |
| Size | stepped sizes (ordinal, ≤ 7 steps) | continuous size ramp within `marks.sizeRange` |
| Label / Detail / Tooltip | value shown as a category label | value shown formatted by its `FormatSpec` |

A measure pill can be discrete (`SUM(x)` as headers of the aggregated values,
as Tableau allows); a dimension can be continuous only if it is a date
(`trunc`) or a number (axis with `bin`).

### 4.2 Date pills

`Pill.date = { level: DateLevel, mode: 'part' | 'trunc' }`,
`DateLevel = 'year'|'quarter'|'month'|'week'|'day'|'hour'|'minute'`.

- Default: **discrete `part`, level `year`**. The pill's `+` drills to the next
  level by **adding a pill** after it on the same shelf (Year ▸ Quarter ▸
  Month ▸ Week ▸ Day ▸ Hour ▸ Minute), as Tableau's hierarchy does. `−` removes
  the deepest.
- Switching to **continuous** sets `trunc` (exact date truncated to the level)
  and renders a time axis; switching back sets `part`.
- `weekday` is a part reachable from the pill menu ("More ▸ Weekday") but not
  in the drill chain.

| Level | `part` label | `part` domain | `trunc` label (start of period) |
|---|---|---|---|
| year | `2024` | all years present | `2024` |
| quarter | `Q1` … `Q4` | 1–4 | `Q1 2024` |
| month | `Jan` … `Dec` | 1–12 | `Jan 2024` |
| week | `Wk 1` … `Wk 53` | **ISO week** number | `2024-02-05` (the ISO week's Monday) |
| day | `1` … `31` (day of month) | 1–31 | `2024-02-05` |
| weekday | `Mon` … `Sun` | Mon-first | — |
| hour | `0` … `23` | 0–23 | `2024-02-05 14:00` |
| minute | `0` … `59` | 0–59 | `2024-02-05 14:07` |

Part domains always show every value present in the data, in natural order
(Jan before Feb, not alphabetic), regardless of `sort`, unless the sort is by
field. Week is **ISO 8601** (week 1 holds the first Thursday; the week year
may differ from the calendar year at the edges) — §10.

### 4.3 Bins

`Pill.bin = {size} | {count}` on a numeric field makes it a discrete
dimension of equal-width bins labelled by their lower edge
(`0`, `50`, `100`, formatted by the field's format). Default for a histogram:
`{count: 20}` over `[min, max]`; `{size}` is user-set. The last bin includes
`max`. Nulls are excluded.

## 5. Shelves

| `ShelfId` | Tableau | Holds | Accepts |
|---|---|---|---|
| `columns` | Columns | many | any pill |
| `rows` | Rows | many | any pill |
| `filters` | Filters | many | any pill; opens the FilterDialog on drop |
| `color` | Marks ▸ Color | **one** | discrete → categorical; continuous → gradient |
| `size` | Marks ▸ Size | **one** | continuous measure (stepped if discrete) |
| `label` | Marks ▸ Label | **one** | any |
| `detail` | Marks ▸ Detail | many | dimensions (adds grouping without visual channel) |
| `tooltip` | Marks ▸ Tooltip | many | any |
| `shape` | Marks ▸ Shape | **one** | discrete, ≤ 10 values |

Dropping a second pill on a one-pill shelf replaces the first. Pages shelf and
dual axis are out of scope (§10). Field order on Columns/Rows is the nesting
order; drag within a shelf reorders.

## 6. Sort and filters

### 6.1 Sort (`Pill.sort: SortSpec`)

| `SortSpec.by` | Tableau | Meaning |
|---|---|---|
| `source` | Data source order | first appearance in the file (default for strings); dates and numbers default to natural order |
| `alpha` | Alphabetic | dictionary order, locale-aware, case-insensitive |
| `field` | Field | by an aggregated measure `{field, aggregation}`, ties by `alpha` |
| `manual` | Manual | explicit `order: string[]`; values not listed follow in `alpha` order |

`dir: 'asc' | 'desc'`. Sorting a header pill sorts nested headers within
their parent. Sort by field uses the measure as aggregated over the whole
filtered data, not per pane.

### 6.2 Filters (`VizSpec.filters: FilterSpec[]`)

| `FilterSpec.kind` | Tableau | Fields | Semantics |
|---|---|---|---|
| `categorical` | General ▸ Select from list | `values: string[]`, `mode: 'include'\|'exclude'`, `includeNull` | list with search and All / None; nulls kept only if `includeNull` |
| `range` | Range of values | `min`, `max` (either may be open) | inclusive on both ends; nulls excluded |
| `dateRange` | Range of dates | `from`, `to`, `level` | inclusive; `to` is the **end** of its period at `level` (a `to` of `2024-02` at month includes Feb 29 … Feb 28, 2024 — Feb 29 exists only in a real 2024) |
| `topN` | Top ▸ By field | `n`, `dir: 'top'\|'bottom'`, `by: {field, aggregation}` | the N values of the filtered field ranked by the measure computed over the rows that survive every **other** filter (Tableau's context-free Top N) |
| `wildcard` | Wildcard | `pattern`, `mode: 'contains'\|'starts'\|'ends'\|'exact'` | case-insensitive substring match; no regex |

Filters AND together; one filter per field (adding another replaces).
Filters apply before aggregation; Top N is evaluated with inner aggregate
then mask (plan §9).

**Defaults on drop** (`src/lib/ui/shelves/drop-rules.ts` `defaultFilter`): a
field landing on the Filters shelf gets a pass-all entry before the dialog
opens — a date or date-treated pill an open `dateRange` (`from`/`to` null,
`level` = the pill's level, else `day`); a measure or numeric field an open
`range` (`min`/`max` null, `includeNull: false`); anything else a
`categorical` with `mode: 'exclude'`, `values: []`, `includeNull: true`. The
Filter dialog opens right after the drop so the user refines it (Tableau
opens the dialog too; it has no pass-all interim state — §10).

## 7. Number formatting (the Format dialog)

`FormatSpec = { kind, decimals, thousands, units, prefix, suffix, negative,
currency, custom, datePattern, booleanLabels, locale }`. A field default lives
in `VizSpec.fieldFormats[field]`; a pill override in `Pill.format` wins. The
dialog shows the options of the selected `kind` only.

### 7.1 Kinds and options

| `kind` | Tableau | Options exposed | Defaults |
|---|---|---|---|
| `automatic` | Automatic | none | thousands on; `integer` storage → 0 decimals, else up to 2 with trailing zeros trimmed; on an **axis** units `auto`; `negative '-'` |
| `number` | Number (Standard) | none | thousands on, 2 decimals, no units, `negative '-'` |
| `number` + any option set | Number (Custom) | `decimals` 0–10 (the contract's `FormatSpec.decimals` range; Tableau allows 15 — §10), `negative`, `units`, `prefix`, `suffix`, `thousands` | decimals 2, `-`, `none`, ``, ``, on |
| `currency` | Currency (Standard / Custom) | `currency` (ISO 4217, default `USD`), `decimals`, `negative`, `units`, `thousands` | locale symbol, 2 decimals, `-` |
| `scientific` | Scientific | `decimals` | 2 → mantissa with 2 decimals, exponent `E±dd` |
| `percent` | Percentage | `decimals`, `thousands` | value × 100, 2 decimals, `%` suffix |
| `custom` | Custom | `custom` format string (§7.3) | — |
| `date` | Date (§8) | `datePattern` | automatic per level |
| `boolean` | Boolean | `booleanLabels: [trueLabel, falseLabel]` | `True` / `False` |

`units`: `none` \| `K` (÷10³) \| `M` (÷10⁶) \| `B` (÷10⁹) \| `auto` (the
largest unit with \|v\| ≥ 1, chosen per **axis** from the axis maximum so every
tick shares a unit; in tooltips and labels `auto` = `none`). `locale` is a
BCP-47 tag (default `en-US`) used for the thousands and decimal characters
and the currency symbol via `Intl.NumberFormat`.

**Rounding:** half away from zero at the requested decimals (`2.5 → 3`,
`−2.5 → −3`), computed on the decimal string so `1.005 → 1.01`. Alignment:
numbers right-aligned in tables and labels, mono font with `tabular-nums`
(`--font-mono`).

### 7.2 Examples — `1234567.891` under each kind

| Kind / options | Output |
|---|---|
| Automatic (number field, label) | `1,234,567.89` |
| Automatic (integer field) on `1234567` | `1,234,567` |
| Automatic (axis tick, units auto) | `1.2M` (axis ticks use 1 decimal when the unit divides) |
| Number (Standard) | `1,234,567.89` |
| Number (Custom) decimals 0 | `1,234,568` |
| Number (Custom) decimals 1, units K | `1,234.6K` |
| Number (Custom) decimals 2, units M | `1.23M` |
| Number (Custom) decimals 2, units B | `0.00B` |
| Number (Custom) decimals 3, thousands off | `1234567.891` |
| Number (Custom) prefix `~`, suffix ` MW` | `~1,234,567.89 MW` |
| Currency (Standard, USD) | `$1,234,567.89` |
| Currency (Custom) decimals 0, units M | `$1M` |
| Currency (Standard, EUR, locale de-DE) | `1.234.567,89 €` |
| Scientific decimals 2 | `1.23E+06` |
| Scientific decimals 0 | `1E+06` |
| Percentage decimals 1 | `123,456,789.1%` |
| Percentage on `0.1234`, decimals 2 | `12.34%` |
| Custom `#,##0.00;(#,##0.00)` | `1,234,567.89` |
| Custom `#,##0,"K"` | `1,235K` |
| Custom `0.0%` on `0.1234` | `12.3%` |

**Negative style** on `−1234567.891`, Number (Custom), 2 decimals:

| `negative` | Tableau | Output |
|---|---|---|
| `-` | `-1234` | `-1,234,567.89` |
| `()` | `(1234)` | `(1,234,567.89)` |
| `red` | `1234` in red | `1,234,567.89` in `--negative` (no sign) |
| `-red` | `-1234` in red | `-1,234,567.89` in `--negative` |

With `units`, the sign or parenthesis wraps the whole token: `(1.23M)`. With
`prefix`/`suffix`: `-$1.23M`, `($1.23M)`.

### 7.3 Custom format strings (subset)

Sections separated by `;`: `positive;negative;zero` (one section applies to
all; two → zero uses positive). Tokens:

| Token | Meaning |
|---|---|
| `0` | digit, zero-padded |
| `#` | digit, blank if insignificant |
| `,` between digits | thousands separator |
| `,` trailing the integer part | scale by 10³ per comma (`#,##0,` → thousands) |
| `.` | decimal point |
| `%` | multiply by 100, append `%` |
| `E+00` / `E-00` | scientific; zeros set the exponent width |
| `"text"` or `\c` | literal |
| anything else | literal |

Not supported (§10): color codes `[Red]`, conditional sections `[>100]`,
locale codes, `?` alignment digits, fractions.

## 8. Date formatting

### 8.1 Automatic

Automatic uses the part/trunc labels of §4.2 for date pills, and for a raw
`date` / `datetime` value in a tooltip or table `yyyy-MM-dd` /
`yyyy-MM-dd HH:mm:ss` (seconds dropped when every value has `:00`).
Tableau's standard list is offered as presets:

`yyyy-MM-dd` · `MM/dd/yyyy` · `dd/MM/yyyy` · `MMM d, yyyy` · `MMMM d, yyyy` ·
`ddd, MMM d, yyyy` · `MMM yyyy` · `yyyy` · `Q yyyy` (`Q1 2024`) · `HH:mm` ·
`h:mm a` · `yyyy-MM-dd HH:mm` · `MMM d, yyyy h:mm a`.

### 8.2 Tokens — examples for `2024-02-05 14:07:09.045` (a Monday, ISO week 6)

| Token | Output | Token | Output |
|---|---|---|---|
| `yyyy` | `2024` | `HH` | `14` |
| `yy` | `24` | `H` | `14` |
| `Q` | `Q1` | `hh` | `02` |
| `MM` | `02` | `h` | `2` |
| `M` | `2` | `mm` | `07` |
| `MMM` | `Feb` | `ss` | `09` |
| `MMMM` | `February` | `SSS` | `045` |
| `ww` | `06` (ISO week) | `a` | `PM` |
| `w` | `6` | `D` | `36` (day of year) |
| `dd` | `05` | `'text'` | literal |
| `d` | `5` | other characters | literal |
| `ddd` | `Mon` | | |
| `dddd` | `Monday` | | |

Month and weekday names are English in v0.1 (`locale` affects numbers only —
§10). Patterns are compiled once per `FormatSpec` and reused.

## 9. Show Me

Each `ChartDef.requires` (`CHARTS.md`) is a small predicate over the current
pills: counts of discrete dimensions **D**, measures **M**, date pills **T**,
continuous pills **C**, plus per-shelf constraints. The chart picker:

- lists every type, **eligible first**, ineligible greyed with the missing
  requirement as text, in this wording: *"Needs 1 dimension and 1 measure"*,
  *"Needs 2 measures (has 1)"*, *"Needs a date on Columns"*, *"Needs 4
  measures in order: open, close, low, high"*; the reason is also the tile's
  `aria-describedby`.
- never selects an ineligible type.
- on selecting an eligible type **rearranges the pills like Tableau** does
  when Show Me is clicked: the table in `CHARTS.md` §3 says, per type, which
  shelf each pill class moves to. Pills not consumed by the layout move to
  `detail`. The move is one `spec-store.patch` (one undo step).
- `suggest()` (automatic type after a drop, when the user has not pinned a
  type): **bar → line (if a date pill is present) → scatter (if 2 measures and
  no dimension) → text-table**.

## 10. Documented deviations from Tableau

| Area | Tableau | Here | Why |
|---|---|---|---|
| Geographic type | Geographic role, maps | not shipped | no maps in v0.1 (plan §16) |
| Dual axis | Dual axis / blended axes | not shipped; two measures → two charts or small multiples | plan §2 |
| Pages shelf | Pages | not shipped | plan §6 |
| Calculated fields | Calculations, LOD, table calcs | none; `calcFields` slot reserved | D-8 |
| ATTR, STDEVP, VARP, PERCENTILE | available | not shipped | §3 |
| Week | locale week (en-US Sunday-start, week 1 = Jan 1) | **ISO 8601** week, Monday-start | deterministic across devices |
| Number (Custom) decimals | 0–15 | 0–10 (`FormatSpec.decimals`, §7.1) | contract range; a change bumps `SPEC_VERSION` |
| Filter on drop | the dialog opens; no filter exists until it is applied | a pass-all `FilterSpec` is written first, then the dialog opens (§6.2) | one entry per Filters pill is a contract invariant (`VIZSPEC.md`) |
| Field list top values | n/a | `TOP_VALUES_LIMIT` = 20 (§1.3) | code wins |
| Null tokens | only the empty cell is null | also `NULL`, `NA`, `N/A`, `NaN`, `#N/A` | exported CSVs carry these; §1.2 |
| Thousands / currency in numbers | `1,234` and `$1,234` may parse as numbers (locale) | strings | no locale-guessing in the parser |
| Time of day column | parses as datetime on 1899-12-30 | datetime on 1970-01-01 | epoch storage |
| Time zone | data-source local | naive values treated as UTC, parts in UTC | identical rendering on every device |
| Custom number formats | full Excel-style grammar incl. colors and conditions | the §7.3 subset | tested surface |
| Month/weekday names | localized | English only | `locale` drives numbers only in v0.1 |
| One filter per field | several allowed (context, condition, top) | one `FilterSpec` per field | simpler UI; Top N is its own kind |
| Boolean inference | `TRUE`/`FALSE` plus locale words | `true/false/t/f/yes/no/y/n` | §1.2 |
| Sort | pane-relative options | whole-data sort by field | §6.1 |

## 11. Formatting UI v2 (T4; D-16, D-19)

The v2 contract fields `style`, `axes.*`, `referenceLines`, `trendLine`,
`annotations`, `Pill.axis` and `axes.synchronized` are edited by six
components under `src/lib/ui/dialogs/` plus the pill menu. Every control
writes the spec at once through `spec.patch` (one undo step per committed
change; text fields and sliders commit on change, never per keystroke). Each
component takes `open` + `onclose` and is hosted by `App.svelte`; the dialog
kinds are registered in `ui.svelte.ts` (`style`, `axis`, `reference`,
`trend`, `annotation`).

### 11.1 Style panel (`StylePanel.svelte`) — Tableau's Format pane

| Control | Writes | Notes |
|---|---|---|
| Font family (`FontPicker`) | `style.fontFamily` | `FONT_FAMILIES` grouped sans / serif / mono, each option in its own face once the Google Fonts stylesheet has loaded (D-14); system fallback offline |
| Scale slider 0.5–2 | `style.fontScale` | multiplies every size below |
| Sizes (title, subtitle, caption, axis ticks, axis titles, mark labels, legend), 6–72 px | `style.{title,subtitle,caption,axis,labels,legend}.size`, `style.axis.titleSize` | |
| Title text / weight / align, subtitle text, caption text | `style.title.{text,weight,align}`, `style.subtitle.text`, `style.caption.text` | an empty text removes the key; the chart shows `style.title.text` when set, else `VizSpec.title` (the worksheet title in the top bar) |
| Background swatches + custom hex | `style.background` | swatches are `transparent` plus the current color encoding's hues; hex is `#rgb` / `#rrggbb` |
| Border, padding 0–96 px | `style.border`, `style.padding` | |
| Legend show / position | `legend.show`, `legend.position` | |
| Mark labels show / position, opacity | `marks.labels`, `marks.opacity` | |
| Reset to defaults | all of the above | `defaultStyle()`, legend right, labels off, opacity 1 |

Desktop: a right-side non-modal panel (the chart stays live); phone: a
bottom sheet (D-11). Deviation from Tableau: one panel for sheet, pane and
axis fonts rather than Tableau's per-area tabs; per-axis options live in
the Axis dialog instead.

### 11.2 Axis dialog (`AxisDialog.svelte`) — Edit Axis + Format Axis

Per axis `x` / `y` / `y2`:

| Control | Writes |
|---|---|
| Title: Automatic / Custom / None | `axes[a].title` = `undefined` / string / `null` |
| Range: Automatic / Fixed with min, max (an empty bound = `'auto'`) | `axes[a].min`, `axes[a].max` |
| Logarithmic, Reversed, Show axis, Gridlines | `axes[a].log`, `.reversed`, `.showAxis`, `.gridlines` |
| Tick numbers (Automatic / Number / Currency / Percent / Scientific with the §7.1 options) | `axes[a].tickFormat` (removed when automatic) |
| Synchronize dual axes (y / y2 only; enabled when a pill sits on the secondary axis or the chart is `combo`) | `axes.synchronized` |
| Mark on this axis: bar / line / area (y / y2 on a `combo` chart) | `marks.markByAxis[primary\|secondary]` |

Tick formats offer the number kinds only (an axis is continuous); the
`custom` format string stays in the Format dialog.

### 11.3 Quick number presets (pill menu ▸ Number format)

On a numeric measure pill: Automatic · Number · Currency · Percent ·
Units none / K / M / B · 0 / 1 / 2 decimals. A kind preset replaces the
kind (Currency seeds `USD`; Percent drops units); a units or decimals
preset merges into the current format, promoting `automatic` to `number`
so the option applies. Each writes `Pill.format` (the pill override of
§7); Automatic removes it so the field default applies again.

### 11.4 Reference lines (`ReferenceLineDialog.svelte`)

A list of `referenceLines` with add / edit / remove. Per line: axis (`y`,
`x`, `y2` when a secondary axis exists), kind (`REFERENCE_LINE_KINDS`:
constant · average · median · min · max · percentile · band), value
(constant) or percentile 0–100, band from (`min` / `p25` / `average` /
`median` / constant) and to (`max` / `p75` / `average` / `median` /
constant), label, color (automatic = the series color), dashed, scope
(whole chart / per color series). A new line is an average on `y`,
dashed, whole chart (Tableau's default). Deviation: Tableau's
distribution bands (standard deviation, confidence) are not offered; the
contract's `band` is percentile / statistic / constant edges only.

### 11.5 Trend line (`TrendLineDialog.svelte`)

`trendLine.enabled`, `.model` (`TREND_MODELS`: linear · log · exp · poly),
`.degree` 2–5 (poly only; removed for other models), `.perSeries`,
`.showEquation` (equation and R²), `.color` (automatic = series color).

### 11.6 Annotations (`AnnotationEditor.svelte`)

Opened from a mark click on the chart with a pending anchor
`{ x, y?, seriesKey? }` (the `annotation` dialog kind, `pending` target):
the note text is written as a new `Annotation` with the default offset
`[12, -24]` px. Opened on an existing id (`edit` target): edit the text,
nudge `offset` x / y (±400 px), delete. The list panel reopens any
annotation. Deviation: Tableau's point / mark / area annotation shapes
collapse to one text box pinned to a mark.

### 11.7 Dual axis (pill menu; D-19)

On a measure pill that shares `rows` or `columns` with at least one other
aggregated measure (bins and date pills do not count): **Dual axis**
toggles `Pill.axis` between `primary` (key absent) and `secondary`;
**Synchronize axis** (shown once a pill is secondary) toggles
`axes.synchronized`; on a `combo` chart **Mark type** sets the bar / line /
area mark of the pill's axis (`marks.markByAxis`). The Axis dialog edits
`y2` like `y`. This supersedes the "Dual axis: not shipped" row of §10.
