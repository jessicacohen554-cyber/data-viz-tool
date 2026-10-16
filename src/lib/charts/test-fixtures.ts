/**
 * Plain-object fixtures for the chart tests: pills, specs and QueryResults
 * built without a worker or a canvas. Trivial first (3 rows, 2 columns), then
 * the per-chart shelf layouts of docs/VIZSPEC.md. Not shipped (test support only).
 */
import type { Aggregation, ChartTypeId, FieldMeta, Pill, QueryResult, ResultDim, ResultMeasure, ShelfId, VizSpec } from '../core/types';
import { createDefaultSpec } from '../core/spec-defaults';
import type { GeoFeature, GeoJson, GeoLayer } from './geo';
import { registerGeoLayer } from './geo-loader';

let seq = 0;

/** A dimension pill. */
export function dim(field: string, extra: Partial<Pill> = {}): Pill {
  return { id: `d${++seq}`, field, role: 'dimension', continuity: 'discrete', aggregation: 'count', ...extra };
}

/** A measure pill. */
export function measure(field: string, aggregation: Aggregation = 'sum', extra: Partial<Pill> = {}): Pill {
  return { id: `m${++seq}`, field, role: 'measure', continuity: 'continuous', aggregation, ...extra };
}

/** A date pill (`trunc` → continuous, `part` → discrete). */
export function date(field: string, level: Pill['date'] extends infer D ? (D extends { level: infer L } ? L : never) : never = 'month', mode: 'part' | 'trunc' = 'trunc'): Pill {
  return { id: `t${++seq}`, field, role: 'dimension', continuity: mode === 'trunc' ? 'continuous' : 'discrete', aggregation: 'count', date: { level, mode } };
}

/** A spec with the given chart type and shelf contents. */
export function makeSpec(chartType: ChartTypeId, shelves: Partial<Record<ShelfId, Pill[]>>, patch: (s: VizSpec) => void = () => {}): VizSpec {
  const spec = createDefaultSpec('fixture');
  spec.chartType = chartType;
  for (const [k, v] of Object.entries(shelves) as Array<[ShelfId, Pill[]]>) spec.shelves[k] = v;
  patch(spec);
  return spec;
}

/** A result dimension from labels (codes) or numbers (values). */
export function resultDim(key: string, data: string[] | number[]): ResultDim {
  if (data.length > 0 && typeof data[0] === 'number') return { key, kind: 'values', values: Float64Array.from(data as number[]) };
  const labels = [...new Set(data as string[])];
  return { key, kind: 'codes', codes: Int32Array.from((data as string[]).map((l) => labels.indexOf(l))), labels };
}

/** A result measure; `null` → NaN. */
export function resultMeasure(key: string, data: Array<number | null>): ResultMeasure {
  return { key, values: Float64Array.from(data.map((v) => (v === null ? NaN : v))) };
}

/** A QueryResult of `groups` rows from the given dims and measures. */
export function makeResult(dims: ResultDim[], measures: ResultMeasure[], extra: Partial<QueryResult> = {}): QueryResult {
  const groups = measures[0]?.values.length ?? dims[0]?.codes?.length ?? dims[0]?.values?.length ?? 0;
  return { key: 'fixture', groups, dims, measures, scannedRows: groups, filteredRows: groups, truncated: false, elapsedMs: 0, ...extra };
}

/** Minimal FieldMeta for a field. */
export function fieldMeta(name: string, type: FieldMeta['type'] = 'string', cardinality = 3): FieldMeta {
  const role = type === 'number' || type === 'integer' ? 'measure' : 'dimension';
  return {
    name, index: 0, type, role, defaultContinuity: role === 'measure' ? 'continuous' : 'discrete', defaultAggregation: role === 'measure' ? 'sum' : 'count',
    storage: role === 'measure' ? 'f64' : 'dict', rowCount: 10, nullCount: 0, cardinality, highCardinality: false, min: null, max: null, topValues: [],
    dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 1,
  };
}

/** Epoch ms of a UTC calendar day. */
export function day(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

/**
 * A tiny GeoJSON layer of two unit squares, `North` (x 0..1, y 1..2) and
 * `South` (x 0..1, y 0..1), keyed by `zone` and `code`, registered as
 * `test-zones` so map builders can join against it without fetching.
 */
export function zonesLayer(): GeoLayer {
  const square = (x0: number, y0: number): GeoFeature['geometry'] => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]] });
  const geojson: GeoJson = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { zone: 'North', code: 'N' }, geometry: square(0, 1) },
      { type: 'Feature', properties: { zone: 'South', code: 'S' }, geometry: square(0, 0) },
    ],
  };
  return registerGeoLayer({ id: 'test-zones', file: 'test-zones.geojson', label: 'Test zones', kind: 'choropleth', keyProps: ['zone', 'code'] }, geojson);
}

/** The 3-row, 2-column trivial fixture: zone × SUM(price). */
export function trivial(): { spec: VizSpec; result: QueryResult; zone: Pill; price: Pill } {
  const zone = dim('zone');
  const price = measure('price', 'avg');
  const spec = makeSpec('bar', { columns: [zone], rows: [price] });
  const result = makeResult([resultDim(zone.id, ['North', 'South', 'West'])], [resultMeasure(price.id, [30, 45, null])]);
  return { spec, result, zone, price };
}
