/**
 * THE CONTRACT — single source of truth for every shard.
 *
 * `VizSpec` fully describes one visualization: which dataset, which pills sit
 * on which shelves, the filters, the chart type, palette, marks and axes.
 * `queryOf()` projects a `VizSpec` to a `QueryPlan` for the data worker; the
 * worker answers with a `QueryResult`; the chart layer turns spec + result into
 * an ECharts option. Nothing outside this file defines a new shape that crosses
 * a shard boundary (rule R-SPEC). Changing a field here is a contract change:
 * bump `SPEC_VERSION` in constants.ts and add a migration in url-codec.ts.
 */

// ---------------------------------------------------------------------------
// Enumerations (string unions; runtime lists live in constants.ts)
// ---------------------------------------------------------------------------

/** Tableau data types. No Geographic in MVP (docs/TABLEAU-SPEC.md). */
export type DataType = 'string' | 'number' | 'integer' | 'date' | 'datetime' | 'boolean';

/** Tableau field role. */
export type Role = 'dimension' | 'measure';

/** Discrete = blue pill (headers); continuous = green pill (axis). */
export type Continuity = 'discrete' | 'continuous';

/** Aggregations; `none` disaggregates to row level. */
export type Aggregation =
  | 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countd' | 'median' | 'stdev' | 'var' | 'none';

/** Date hierarchy levels (Tableau: Year ▸ Quarter ▸ Month ▸ Week ▸ Day ▸ Hour ▸ Minute). */
export type DateLevel = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute';

/** `part` = discrete date part ("Mar", "Q2"); `trunc` = continuous date value truncated to the level. */
export type DateMode = 'part' | 'trunc';

/** Shelves. `columns`/`rows`/`filters` are the main shelves; the rest form the Marks card. */
export type ShelfId =
  | 'columns' | 'rows' | 'filters' | 'color' | 'size' | 'label' | 'detail' | 'tooltip' | 'shape';

/** Chart library (docs/CHARTS.md). */
export type ChartTypeId =
  | 'bar' | 'bar-h' | 'bar-grouped' | 'bar-stacked' | 'bar-stacked-100'
  | 'line' | 'area' | 'streamgraph'
  | 'scatter' | 'bubble'
  | 'pie' | 'donut' | 'funnel' | 'gauge'
  | 'treemap' | 'sunburst'
  | 'heatmap' | 'calendar-heatmap' | 'highlight-table'
  | 'histogram' | 'boxplot'
  | 'waterfall' | 'bullet' | 'lollipop' | 'dumbbell'
  | 'radar' | 'parallel' | 'sankey'
  | 'slope' | 'bump'
  | 'candlestick'
  | 'kpi' | 'text-table';

/** How a column is stored in the worker's column store. */
export type Storage = 'dict' | 'f64' | 'i32' | 'date' | 'bool';

// ---------------------------------------------------------------------------
// Dataset catalog
// ---------------------------------------------------------------------------

/** One entry of `public/data/manifest.json` (written by scripts/build_manifest.py) or a device-opened file. */
export interface DatasetEntry {
  /** Slug of the filename without extension, e.g. "ercot-system-hourly-2024". */
  id: string;
  /** Path relative to the site root, e.g. "data/datasets/ercot-system-hourly-2024.csv". Empty for `source: 'local'`. */
  file: string;
  /** Display name. */
  name: string;
  bytes: number;
  /** Data rows excluding the header; null when unknown (> 200 MB or local file). */
  rows: number | null;
  /** Header row. */
  columns: string[];
  /** SHA-1 of the file bytes; cache key. Empty for local files. */
  sha1: string;
  /** ISO timestamp of the file's mtime. */
  modified: string;
  description: string | null;
  /** `catalog` = from the manifest; `local` = opened from the user's device (never uploaded). */
  source: 'catalog' | 'local';
}

/** The manifest file. */
export interface DatasetManifest {
  version: 1;
  generatedAt: string;
  datasets: DatasetEntry[];
}

// ---------------------------------------------------------------------------
// Column metadata (produced by the worker after load)
// ---------------------------------------------------------------------------

/** Inferred (or user-overridden) metadata for one column. */
export interface FieldMeta {
  /** Column header, unique within the dataset (duplicates are suffixed " (2)"). */
  name: string;
  /** Position in the column store. */
  index: number;
  type: DataType;
  role: Role;
  /** measure → continuous; dimension → discrete; date → discrete (part). */
  defaultContinuity: Continuity;
  /** measure → sum; dimension → count. */
  defaultAggregation: Aggregation;
  storage: Storage;
  rowCount: number;
  nullCount: number;
  /** Distinct non-null values (exact for dict/bool/i32; approximate above 1M rows for f64/date). */
  cardinality: number;
  /** cardinality > max(5000, 0.5 × rowCount). Such a field needs a Top N filter on a discrete axis. */
  highCardinality: boolean;
  /** Numbers and dates (epoch ms); null for strings/booleans. */
  min: number | null;
  max: number | null;
  /** Up to 20 [label, count] pairs for dict columns, by count desc. */
  topValues: Array<[string, number]>;
  /** Detected date pattern (docs/TABLEAU-SPEC.md token table), e.g. "yyyy-MM-dd'T'HH:mm". */
  dateFormat: string | null;
  /** True when day/month order could not be resolved from the sample (defaults to M/d). */
  dateAmbiguous: boolean;
  /** Values coerced to null while building the typed column. */
  parseErrors: number;
  /** Inference confidence 0..1. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// VizSpec
// ---------------------------------------------------------------------------

/** Sort for a dimension pill. */
export interface SortSpec {
  by: 'alpha' | 'field' | 'manual' | 'source';
  dir: 'asc' | 'desc';
  /** When `by === 'field'`: the measure field and aggregation to sort by. */
  field?: string;
  aggregation?: Aggregation;
  /** When `by === 'manual'`: explicit label order. */
  manual?: string[];
}

/** Date treatment of a date/datetime pill. */
export interface DateTreatment {
  level: DateLevel;
  mode: DateMode;
}

/** Bin treatment of a measure used as a (histogram) dimension. */
export type BinSpec = { size: number } | { count: number };

/** A field dropped on a shelf. Pills move between shelves as the same object (stable `id`). */
export interface Pill {
  /** Stable unique id (UUID v4) kept across moves. */
  id: string;
  /** `FieldMeta.name`. */
  field: string;
  /** May differ from the field default (e.g. a year column used as a dimension). */
  role: Role;
  continuity: Continuity;
  /** Measures only; `none` = disaggregate. Dimensions carry their default and ignore it. */
  aggregation: Aggregation;
  /** Date/datetime fields only. */
  date?: DateTreatment;
  /** Measure-as-dimension binning (histogram). */
  bin?: BinSpec;
  /** Dimension pills only. */
  sort?: SortSpec;
  /** Overrides `VizSpec.fieldFormats[field]`. */
  format?: FormatSpec;
  /** Display name override. */
  alias?: string;
}

/** Filter shelf entries, keyed by the pill they belong to. */
export type FilterSpec =
  | { pillId: string; field: string; kind: 'categorical'; mode: 'include' | 'exclude'; values: string[]; includeNull: boolean }
  | { pillId: string; field: string; kind: 'range'; min: number | null; max: number | null; includeNull: boolean }
  | { pillId: string; field: string; kind: 'dateRange'; from: number | null; to: number | null; level?: DateLevel }
  | { pillId: string; field: string; kind: 'topN'; n: number; dir: 'top' | 'bottom'; by: { field: string; aggregation: Aggregation } }
  | { pillId: string; field: string; kind: 'wildcard'; pattern: string; mode: 'contains' | 'starts' | 'ends' | 'exact' };

/** Tableau's number/date format dialog (docs/TABLEAU-SPEC.md §Formatting). */
export interface FormatSpec {
  kind: 'automatic' | 'number' | 'currency' | 'percent' | 'scientific' | 'custom' | 'date' | 'boolean';
  /** 0..10 */
  decimals?: number;
  /** Thousands separator on/off. */
  thousands?: boolean;
  units?: 'none' | 'K' | 'M' | 'B' | 'auto';
  prefix?: string;
  suffix?: string;
  negative?: '-' | '()' | 'red' | '-red';
  /** Currency symbol, default "$". */
  currency?: string;
  /** Custom format string subset: "#,##0.00;(#,##0.00)". */
  custom?: string;
  /** Date pattern, e.g. "MMM d, yyyy". */
  datePattern?: string;
  booleanLabels?: [trueLabel: string, falseLabel: string];
  /** BCP-47; default `navigator.language`. */
  locale?: string;
}

/** Palette choice for the Color shelf (docs/PALETTES.md). */
export interface PaletteSelection {
  /** `auto` picks by the Color pill's continuity; `manual` honours the ids below. */
  mode: 'auto' | 'manual';
  categorical?: string;
  sequential?: string;
  diverging?: string;
  /** Force diverging for a continuous Color pill. */
  useDiverging?: boolean;
  midpoint?: number | 'zero' | 'mean' | 'median';
  reverse?: boolean;
  domain?: [number, number] | 'auto';
  /** Per-label overrides (label → hex) for categorical color. */
  overrides?: Record<string, string>;
}

/** Mark settings (Marks card options that are not pills). */
export interface MarkSettings {
  /** 0..1 */
  opacity: number;
  /** Pixel range for scatter/bubble symbol size. */
  sizeRange: [number, number];
  stacking: 'none' | 'stack' | 'percent';
  lineWidth: number;
  smooth: boolean;
  showPoints: boolean;
  labels: { show: boolean; position: 'auto' | 'inside' | 'outside' | 'top' };
  /** 0..1 gap between bars. */
  barGap: number;
  /** Line/area treatment of null groups. */
  nullHandling: 'break' | 'connect' | 'zero';
  /** Chart-specific knobs (gauge.min/max/target, candlestick.upColor, treemap.depth, …). */
  extra: Record<string, unknown>;
}

/** Axis settings. */
export interface AxisSpec {
  /** undefined = auto title from pills; null = hidden. */
  title?: string | null;
  min?: number | 'auto';
  max?: number | 'auto';
  log: boolean;
  reversed: boolean;
  gridlines: boolean;
  showAxis: boolean;
  tickFormat?: FormatSpec;
}

/** Legend settings. */
export interface LegendSpec {
  show: boolean;
  position: 'right' | 'bottom' | 'top';
}

/** A complete visualization. */
export interface VizSpec {
  version: 1;
  datasetId: string;
  title: string;
  subtitle?: string;
  chartType: ChartTypeId;
  /** Every shelf is always present (possibly empty). color/size/label/shape hold ≤ 1 pill. */
  shelves: Record<ShelfId, Pill[]>;
  /** One entry per pill on the `filters` shelf. */
  filters: FilterSpec[];
  /** User "Change Data Type / Convert to Dimension" overrides, by field name. */
  typeOverrides: Record<string, { type?: DataType; role?: Role; dateFormat?: string }>;
  palette: PaletteSelection;
  marks: MarkSettings;
  axes: { x: AxisSpec; y: AxisSpec };
  legend: LegendSpec;
  /** Default format per field; `Pill.format` overrides. */
  fieldFormats: Record<string, FormatSpec>;
}

/** A named, persisted VizSpec (localStorage key `viz:views:<datasetId>`). */
export interface SavedView {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  spec: VizSpec;
  /** Optional 160px PNG data URL. */
  thumbnail?: string;
}

// ---------------------------------------------------------------------------
// Query (derived from VizSpec; consumed by the worker)
// ---------------------------------------------------------------------------

/** A group-by dimension in a query. `key` is the originating pill id. */
export interface QueryDim {
  key: string;
  field: string;
  date?: DateTreatment;
  bin?: BinSpec;
}

/** An aggregated measure in a query. */
export interface QueryMeasure {
  key: string;
  field: string;
  aggregation: Aggregation;
}

/** Sort applied to the result groups. */
export interface QuerySort {
  dimKey: string;
  by: 'label' | 'value' | 'manual';
  measureKey?: string;
  dir: 'asc' | 'desc';
  manual?: string[];
}

/** What the worker computes. Render-only settings never appear here. */
export interface QueryPlan {
  datasetId: string;
  dims: QueryDim[];
  measures: QueryMeasure[];
  filters: FilterSpec[];
  /** True when any measure has aggregation `none`: rows are returned instead of groups. */
  disaggregate: boolean;
  sort?: QuerySort;
  /** Maximum groups/rows returned (desktop 50 000, phone 20 000). */
  limit: number;
  /** Boxplot statistics for one measure. */
  boxstats?: { measureKey: string };
}

/** One result dimension: discrete → `codes` + `labels`; continuous/date-trunc/bin → `values`. */
export interface ResultDim {
  key: string;
  kind: 'codes' | 'values';
  codes?: Int32Array;
  labels?: string[];
  values?: Float64Array;
}

/** One result measure (NaN = null group). */
export interface ResultMeasure {
  key: string;
  values: Float64Array;
}

/** Boxplot statistics per group. */
export interface BoxStats {
  q1: Float64Array;
  med: Float64Array;
  q3: Float64Array;
  lo: Float64Array;
  hi: Float64Array;
  outliers: Float64Array[];
}

/** The worker's answer to a QueryPlan. Typed arrays are transferred, not copied. */
export interface QueryResult {
  /** `queryKey(plan)`. */
  key: string;
  /** Number of result rows (groups, or rows when disaggregated). */
  groups: number;
  dims: ResultDim[];
  measures: ResultMeasure[];
  boxstats?: BoxStats;
  scannedRows: number;
  filteredRows: number;
  truncated: boolean;
  elapsedMs: number;
}

/** Field-level profile for the filter dialog. */
export interface FieldProfile {
  field: string;
  labels: string[];
  counts: Int32Array;
  min: number | null;
  max: number | null;
  nullCount: number;
  truncated: boolean;
}

/** Load progress events. */
export interface LoadProgress {
  phase: 'download' | 'parse' | 'build';
  loaded: number;
  total: number | null;
  rows: number;
}
