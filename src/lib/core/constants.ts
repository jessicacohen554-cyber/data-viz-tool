/**
 * Runtime enumerations and limits for the contract in types.ts.
 * Every tunable number in the app lives here with a reason (rule R-TOKENS
 * covers CSS; this file covers behaviour).
 */
import type {
  Aggregation, ChartTypeId, Continuity, DataType, DateLevel, GeoRole, Role, ShelfId,
} from './types';

/** Bump when a VizSpec field changes shape; url-codec.ts migrates older versions. */
export const SPEC_VERSION = 2 as const;

export const DATA_TYPES: readonly DataType[] = ['string', 'number', 'integer', 'date', 'datetime', 'boolean'];
export const ROLES: readonly Role[] = ['dimension', 'measure'];
export const CONTINUITIES: readonly Continuity[] = ['discrete', 'continuous'];

/** Aggregations in Tableau menu order. */
export const AGGREGATIONS: readonly Aggregation[] = [
  'sum', 'avg', 'median', 'count', 'countd', 'min', 'max', 'stdev', 'var',
  'p05', 'p10', 'p25', 'p75', 'p90', 'p95', 'none',
];

/** Percentile aggregations and their levels (0..100). */
export const PERCENTILE_LEVEL: Readonly<Partial<Record<Aggregation, number>>> = {
  p05: 5, p10: 10, p25: 25, median: 50, p75: 75, p90: 90, p95: 95,
};

/** Human labels for aggregations (Tableau pill prefixes). */
export const AGGREGATION_LABEL: Record<Aggregation, string> = {
  sum: 'SUM', avg: 'AVG', median: 'MEDIAN', count: 'CNT', countd: 'CNTD',
  min: 'MIN', max: 'MAX', stdev: 'STDEV', var: 'VAR', none: '',
  p05: 'P5', p10: 'P10', p25: 'P25', p75: 'P75', p90: 'P90', p95: 'P95',
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
  'area-stacked', 'area-100', 'combo', 'envelope', 'map-choropleth', 'map-symbol',
];

/**
 * v2 chart ids declared in the contract but not yet in the registry. The charts
 * shard moves each id into CHART_TYPE_IDS as it registers it; the registry test
 * checks CHART_TYPE_IDS only, so `main` stays green while shards are in flight.
 */
export const PENDING_CHART_TYPE_IDS: readonly ChartTypeId[] = [];

/** Geographic roles in menu order. */
export const GEO_ROLES: readonly GeoRole[] = ['country', 'us-state', 'us-county', 'ercot-zone', 'latitude', 'longitude'];

/** Geo layer per area role (ids in public/geo/index.json). */
export const GEO_LAYER_FOR_ROLE: Readonly<Partial<Record<GeoRole, string>>> = {
  country: 'world-countries', 'us-state': 'us-states', 'us-county': 'us-counties', 'ercot-zone': 'ercot-zones',
};

/**
 * Curated font families (owner ruling D-14): loaded on demand from Google Fonts,
 * with a system fallback stack so the app renders offline.
 */
export interface FontFamily { id: string; label: string; css: string; google?: string; kind: 'sans' | 'serif' | 'mono' }
export const FONT_FAMILIES: readonly FontFamily[] = [
  { id: 'inherit', label: 'App default (DM Sans)', css: "'DM Sans', 'Plus Jakarta Sans', 'Helvetica Neue', sans-serif", kind: 'sans' },
  { id: 'plus-jakarta', label: 'Plus Jakarta Sans', css: "'Plus Jakarta Sans', sans-serif", google: 'Plus+Jakarta+Sans:wght@400;500;600;700;800', kind: 'sans' },
  { id: 'inter', label: 'Inter', css: "'Inter', sans-serif", google: 'Inter:wght@400;500;600;700', kind: 'sans' },
  { id: 'roboto', label: 'Roboto', css: "'Roboto', sans-serif", google: 'Roboto:wght@400;500;700', kind: 'sans' },
  { id: 'lato', label: 'Lato', css: "'Lato', sans-serif", google: 'Lato:wght@400;700', kind: 'sans' },
  { id: 'open-sans', label: 'Open Sans', css: "'Open Sans', sans-serif", google: 'Open+Sans:wght@400;600;700', kind: 'sans' },
  { id: 'nunito', label: 'Nunito', css: "'Nunito', sans-serif", google: 'Nunito:wght@400;600;700', kind: 'sans' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', css: "'IBM Plex Sans', sans-serif", google: 'IBM+Plex+Sans:wght@400;500;600', kind: 'sans' },
  { id: 'work-sans', label: 'Work Sans', css: "'Work Sans', sans-serif", google: 'Work+Sans:wght@400;500;600', kind: 'sans' },
  { id: 'source-serif', label: 'Source Serif 4', css: "'Source Serif 4', serif", google: 'Source+Serif+4:wght@400;600;700', kind: 'serif' },
  { id: 'merriweather', label: 'Merriweather', css: "'Merriweather', serif", google: 'Merriweather:wght@400;700', kind: 'serif' },
  { id: 'playfair', label: 'Playfair Display', css: "'Playfair Display', serif", google: 'Playfair+Display:wght@400;600;700', kind: 'serif' },
  { id: 'lora', label: 'Lora', css: "'Lora', serif", google: 'Lora:wght@400;600', kind: 'serif' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', css: "'JetBrains Mono', monospace", google: 'JetBrains+Mono:wght@400;500', kind: 'mono' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', css: "'IBM Plex Mono', monospace", google: 'IBM+Plex+Mono:wght@400;500', kind: 'mono' },
  { id: 'system', label: 'System UI', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", kind: 'sans' },
  { id: 'georgia', label: 'Georgia', css: "Georgia, 'Times New Roman', serif", kind: 'serif' },
];

/** Reference line kinds in menu order. */
export const REFERENCE_LINE_KINDS = ['constant', 'average', 'median', 'min', 'max', 'percentile', 'band'] as const;

/** Trend models in menu order. */
export const TREND_MODELS = ['linear', 'log', 'exp', 'poly'] as const;

/** Default envelope levels: outer P5–P95, inner P25–P75. */
export const DEFAULT_ENVELOPE_LEVELS: ReadonlyArray<readonly [number, number]> = [[5, 95], [25, 75]];

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
