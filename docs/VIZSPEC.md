> Status: ACTIVE — contract narrative for `src/lib/core/types.ts`. Code wins on conflict (R-TRUTH).

# VizSpec — the contract

One `VizSpec` object fully describes a worksheet. It is the only viz state in the app (R-SPEC), it round-trips through the URL hash and saved views, and every shard codes against it. This page explains the shapes; the TypeScript in `src/lib/core/types.ts` is normative.

## Flow

```
FieldMeta[]  ──newPill()──▶  Pill on a shelf  ──┐
                                                 ├─▶ VizSpec ──queryOf()──▶ QueryPlan ──worker──▶ QueryResult
filters / palette / marks / axes / chart type ───┘        │                                           │
                                                          └──────────── spec-builder (S3) ◀───────────┘
                                                                                  │
                                                                           ECharts option / DOM
```

`queryOf()` keeps only what changes the numbers (dims, measures, filters, disaggregation, sort, limit, boxstats). Chart type, formats, palette, marks, axes and legend are render-only and never reach the worker. `queryKey(plan)` is a canonical string independent of pill ids, so two specs that ask the same question share one cached result.

## Shapes at a glance

| Type | Role | Owner |
|---|---|---|
| `DatasetEntry`, `DatasetManifest` | catalog rows from `data/manifest.json` or a device-opened file (`source: 'local'`) | S0 / S5 |
| `FieldMeta` | per-column inference: type, role, continuity, storage, cardinality, date format | S1 produces |
| `Pill` | a field on a shelf: role, continuity, aggregation, date treatment, bin, sort, format, alias | S4 edits |
| `FilterSpec` | categorical · range · dateRange · topN · wildcard, keyed by the filter pill's id | S5 edits, S1 applies |
| `FormatSpec` | Tableau's number/date dialog | S2 renders |
| `PaletteSelection` | auto/manual palette ids, diverging switch, midpoint, overrides | S2 resolves |
| `MarkSettings`, `AxisSpec`, `LegendSpec` | render-only knobs | S3 reads |
| `QueryPlan` → `QueryResult` | the worker protocol payloads | S1 |
| `SavedView` | a named spec in localStorage | S5 |

## Rules the shapes encode

- Every shelf key is always present (possibly `[]`). `color`, `size`, `label`, `shape` hold at most one pill.
- A pill's `id` is stable for its lifetime; moving a pill between shelves moves the same object.
- `Pill.role` may differ from `FieldMeta.role` (a year column converted to a dimension). `aggregation: 'none'` disaggregates the whole query.
- A date pill always carries `date: { level, mode }`. `part` is discrete (Tableau's blue "MONTH(ts)"), `trunc` is continuous (green "MONTH(ts)" as a date value).
- A measure with `bin` acts as a dimension (histogram).
- `filters[]` has exactly one entry per pill on the `filters` shelf, joined by `pillId`.
- `typeOverrides` is re-applied at load, before inference results are reported.
- `fieldFormats[field]` is the default; `Pill.format` overrides for that pill only.
- `QueryResult.dims[i].kind` is `codes` (discrete: `codes` index into `labels`) or `values` (continuous / date-trunc epoch ms / bin start). Measures are `Float64Array` with `NaN` for a null group. Typed arrays are transferred, not copied.

## Example: bar of average price by zone, filtered to 2024

```json
{
  "version": 1,
  "datasetId": "ercot-system-hourly-2019-2025",
  "title": "Average price by zone, 2024",
  "chartType": "bar",
  "shelves": {
    "columns": [{ "id": "p1", "field": "zone", "role": "dimension", "continuity": "discrete", "aggregation": "count",
                  "sort": { "by": "field", "dir": "desc", "field": "price_usd_mwh", "aggregation": "avg" } }],
    "rows":    [{ "id": "p2", "field": "price_usd_mwh", "role": "measure", "continuity": "continuous", "aggregation": "avg" }],
    "filters": [{ "id": "p3", "field": "timestamp", "role": "dimension", "continuity": "discrete", "aggregation": "count",
                  "date": { "level": "year", "mode": "part" } }],
    "color": [], "size": [], "label": [], "detail": [], "tooltip": [], "shape": []
  },
  "filters": [{ "pillId": "p3", "field": "timestamp", "kind": "dateRange", "from": 1704067200000, "to": 1735689599000 }],
  "typeOverrides": {},
  "palette": { "mode": "auto" },
  "marks": { "opacity": 1, "sizeRange": [6, 40], "stacking": "none", "lineWidth": 2, "smooth": false, "showPoints": false,
             "labels": { "show": true, "position": "top" }, "barGap": 0.2, "nullHandling": "break", "extra": {} },
  "axes": { "x": { "log": false, "reversed": false, "gridlines": false, "showAxis": true },
            "y": { "log": false, "reversed": false, "gridlines": true, "showAxis": true, "title": "$/MWh" } },
  "legend": { "show": false, "position": "right" },
  "fieldFormats": { "price_usd_mwh": { "kind": "currency", "decimals": 2 } }
}
```

`queryOf` of that spec:

```json
{ "datasetId": "ercot-system-hourly-2019-2025",
  "dims": [{ "key": "p1", "field": "zone" }],
  "measures": [{ "key": "p2", "field": "price_usd_mwh", "aggregation": "avg" }],
  "filters": [ { "...": "the dateRange above" } ],
  "disaggregate": false,
  "sort": { "dimKey": "p1", "by": "value", "measureKey": "p2", "dir": "desc" },
  "limit": 50000 }
```

## Per-chart shelf examples

| Chart | columns | rows | marks | Notes |
|---|---|---|---|---|
| line | `MONTH(timestamp)` trunc | `AVG(price)` | color: `zone` | one series per color label |
| heatmap | `HOUR(timestamp)` part | `WEEKDAY`? → use `DAY` part of a date | color: `AVG(price)` | continuous color → sequential palette |
| scatter | `AVG(demand_mw)` | `AVG(price)` | detail: `zone`, size: `SUM(ordc_adder)` | detail adds a group without encoding |
| scatter (rows) | `demand_mw` none | `price` none | color: `zone` | `aggregation: 'none'` → `disaggregate: true` |
| treemap | `fuel_group`, `class` | `SUM(generation_mw)` | — | nested dims become the hierarchy |
| histogram | `price` with `bin: { size: 10 }` | `CNT(price)` | — | binned measure acts as a dimension |
| boxplot | `zone` | `price` | — | registry sets `needs.boxstats` |
| candlestick | `DAY(timestamp)` trunc | `open, close, low, high` (4 measures, in order) | — | order validated by the registry |
| kpi | — | `AVG(price)` | — | DOM renderer |

## Versioning

`SPEC_VERSION` in `constants.ts` is `1`. A shape change bumps it and adds a case to `migrateSpec()` in `url-codec.ts`; `validateSpec()` rejects anything else.
