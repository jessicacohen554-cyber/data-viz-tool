/**
 * Runtime enumerations and limits for the contract in types.ts.
 * Every tunable number in the app lives here with a reason (rule R-TOKENS
 * covers CSS; this file covers behaviour).
 */
import type {
  Aggregation, ChartTypeId, Continuity, DataType, DateLevel, Role, ShelfId,
} from './types';

/** Bump when a VizSpec field changes shape; url-codec.ts migrates older versions. */
export const SPEC_VERSION = 1 as const;

export const DATA_TYPES: readonly DataType[] = ['string', 'number', 'integer', 'date', 'datetime', 'boolean'];
export const ROLES: readonly Role[] = ['dimension', 'measure'];
export const CONTINUITIES: readonly Continuity[] = ['discrete', 'continuous'];

/** Aggregations in Tableau menu order. */
export const AGGREGATIONS: readonly Aggregation[] = [
  'sum', 'avg', 'median', 'count', 'countd', 'min', 'max', 'stdev', 'var', 'none',
];

/** Human labels for aggregations (Tableau pill prefixes). */
export const AGGREGATION_LABEL: Record<Aggregation, string> = {
  sum: 'SUM', avg: 'AVG', median: 'MEDIAN', count: 'CNT', countd: 'CNTD',
  min: 'MIN', max: 'MAX', stdev: 'STDEV', var: 'VAR', none: '',
};

/** Date hierarchy, coarse → fine. */
export const DATE_LEVELS: readonly DateLevel[] = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute'];

/** Main shelves in display order. */
export const MAIN_SHELVES: readonly ShelfId[] = ['columns', 'rows', 'filters'];

/** Marks card shelves in Tableau order. */
export const MARK_SHELVES: readonly ShelfId[] = ['color', 'size', 'label', 'detail', 'tooltip', 'shape'];

export const ALL_SHELVES: readonly ShelfId[] = [...MAIN_SHELVES, ...MARK_SHELVES];

/** Shelves that accept at most one pill. */
export const SINGLE_PILL_SHELVES: ReadonlySet<ShelfId> = new Set<ShelfId>(['color', 'size', 'label', 'shape']);

/** All chart ids; the registry (S3) must cover exactly this list. */
export const CHART_TYPE_IDS: readonly ChartTypeId[] = [
  'bar', 'bar-h', 'bar-grouped', 'bar-stacked', 'bar-stacked-100',
  'line', 'area', 'streamgraph',
  'scatter', 'bubble',
  'pie', 'donut', 'funnel', 'gauge',
  'treemap', 'sunburst',
  'heatmap', 'calendar-heatmap', 'highlight-table',
  'histogram', 'boxplot',
  'waterfall', 'bullet', 'lollipop', 'dumbbell',
  'radar', 'parallel', 'sankey',
  'slope', 'bump',
  'candlestick',
  'kpi', 'text-table',
];

/** Default chart for an empty worksheet. */
export const DEFAULT_CHART: ChartTypeId = 'text-table';

// ---------------------------------------------------------------------------
// Limits (performance budgets; see plan §9 and docs/ARCHITECTURE.md)
// ---------------------------------------------------------------------------

/** Rows sampled for type inference and date-format detection. */
export const INFERENCE_SAMPLE_ROWS = 5000;

/** Max result groups returned to the main thread. */
export const QUERY_LIMIT_DESKTOP = 50_000;
export const QUERY_LIMIT_MOBILE = 20_000;

/** A discrete axis refuses more categories than this without a Top N filter. */
export const MAX_AXIS_CATEGORIES = 5000;

/** Hard row cap on phones (rows beyond are dropped with a warning). */
export const MAX_ROWS_MOBILE = 1_000_000;

/** `highCardinality` threshold: cardinality > max(this, 0.5 × rowCount). */
export const HIGH_CARDINALITY_MIN = 5000;

/** Dense group-by key is used while the product of dim cardinalities is ≤ this. */
export const DENSE_KEY_MAX_CELLS = 4_000_000;

/** Query result LRU size on the main thread. */
export const RESULT_CACHE_SIZE = 16;

/** Progress events are throttled to one per this many ms. */
export const PROGRESS_INTERVAL_MS = 100;

/** Top values retained per dict column in FieldMeta. */
export const TOP_VALUES_LIMIT = 20;

/** Viewport width (px) at and below which the phone layout is used. */
export const MOBILE_BREAKPOINT = 900;

/** Undo history depth. */
export const UNDO_DEPTH = 50;

/** localStorage key prefixes. */
export const STORAGE_PREFIX = 'viz:';
export const STORAGE_VIEWS = `${STORAGE_PREFIX}views:`;
export const STORAGE_RECENT = `${STORAGE_PREFIX}recent:`;
