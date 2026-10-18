/**
 * v2 chart layer (shard T2): dual axis, combo, stacked / 100 % area,
 * envelope (both modes), maps (fill, label, symbol, bubble, heat) over an
 * inline GeoJSON layer, reference lines and bands, trend lines, annotations,
 * the style pass and Shape-shelf icons. Structural assertions on fixture
 * results; every number asserted is computed by the test.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { QueryResult, VizSpec } from '../core/types';
import type { BuildContext } from './registry';
import { buildOption, tryBuildOption } from './spec-builder';
import { envelopeLevels } from './types/envelope';
import { fitViewToPoints, geoRoleFor, mapLayerId } from './map-common';
import { clearGeoLayers } from './geo-loader';
import { date, day, dim, fieldMeta, makeResult, makeSpec, measure, resultDim, resultMeasure, zonesLayer } from './test-fixtures';

type S = Record<string, unknown> & { type: string; data: unknown[]; name?: string };
type Axis = Record<string, unknown> & { splitLine?: { show: boolean }; axisLabel?: Record<string, unknown>; min?: number; max?: number; type?: string; position?: string };

function ctx(spec: VizSpec, result: QueryResult, meta: BuildContext['meta'] = []): BuildContext {
  return { spec, result, meta, isMobile: false };
}

/** zone × [AVG(price), SUM(demand)] with demand on the right axis. */
function dual(chart: 'bar' | 'line' | 'bar-h' = 'bar') {
  const zone = dim('zone'); const p = measure('price', 'avg'); const q = measure('demand', 'sum', { axis: 'secondary' });
  const shelves = chart === 'bar-h' ? { rows: [zone], columns: [p, q] } : { columns: [zone], rows: [p, q] };
  const spec = makeSpec(chart, shelves);
  const result = makeResult([resultDim(zone.id, ['North', 'South', 'West'])], [resultMeasure(p.id, [30, 45, null]), resultMeasure(q.id, [1000, 1200, 900])]);
  return { spec, result, zone, p, q };
}

beforeAll(() => { clearGeoLayers(); zonesLayer(); });

describe('dual axis (D-19)', () => {
  it('bar: two value axes, secondary series on yAxis 1, names carry the axis, legend shows', () => {
    const { spec, result } = dual('bar');
    const o = buildOption(ctx(spec, result));
    const y = o.yAxis as Axis[];
    expect(Array.isArray(y)).toBe(true);
    expect(y).toHaveLength(2);
    expect(y[1]!.position).toBe('right');
    const s = o.series as S[];
    expect(s.map((x) => x.name)).toEqual(['AVG(price)', 'SUM(demand) (right)']);
    expect(s.map((x) => x.yAxisIndex)).toEqual([0, 1]);
    expect((o.legend as { show: boolean }).show).toBe(true);
    expect((o.__meta as { dualAxis: boolean }).dualAxis).toBe(true);
  });

  it('line: same, and a primary-only spec keeps a single yAxis object', () => {
    const { spec, result } = dual('line');
    const o = buildOption(ctx(spec, result));
    expect((o.yAxis as Axis[]).length).toBe(2);
    expect((o.series as S[])[1]!.yAxisIndex).toBe(1);
    spec.shelves.rows[1]!.axis = 'primary';
    const single = buildOption(ctx(spec, result));
    expect(Array.isArray(single.yAxis)).toBe(false);
    expect((single.series as S[]).map((x) => x.name)).toEqual(['AVG(price)', 'SUM(demand)']);
  });

  it('horizontal bars put the secondary axis on top as a second xAxis', () => {
    const { spec, result } = dual('bar-h');
    const o = buildOption(ctx(spec, result));
    const x = o.xAxis as Axis[];
    expect(x).toHaveLength(2);
    expect(x[1]!.position).toBe('top');
    expect((o.series as S[])[1]!.xAxisIndex).toBe(1);
  });

  it('y2 is styled from axes.y2 (gridlines, log, title, min/max) and synchronized copies the primary range', () => {
    const { spec, result } = dual('bar');
    spec.axes.y2 = { log: true, reversed: true, gridlines: false, showAxis: true, title: 'MW', min: 10, max: 5000 };
    const y2 = (buildOption(ctx(spec, result)).yAxis as Axis[])[1]!;
    expect(y2.type).toBe('log');
    expect(y2.splitLine!.show).toBe(false);
    expect(y2.inverse).toBe(true);
    expect(y2.name).toBe('MW');
    expect([y2.min, y2.max]).toEqual([10, 5000]);
    spec.axes.y2 = { log: false, reversed: false, gridlines: true, showAxis: true };
    spec.axes.synchronized = true;
    const [a, b] = buildOption(ctx(spec, result)).yAxis as Axis[];
    // Primary data 30..45 → extent [0, 45] on a step of 5.
    expect(a!.min).toBe(0);
    expect(a!.max).toBe(45);
    expect([b!.min, b!.max]).toEqual([a!.min, a!.max]);
  });

  it('stacked bars stack per axis, never across the two axes', () => {
    const { spec, result } = dual('bar');
    spec.chartType = 'bar-stacked';
    spec.shelves.color = [dim('fuel')];
    const s = buildOption(ctx(spec, result)).series as S[];
    expect(s[0]!.stack).toBe('total');
    expect(s[1]!.stack).toBe('total-secondary');
    expect((buildOption(ctx(spec, result)).__meta as { colorIgnored: boolean }).colorIgnored).toBe(true);
  });
});

describe('combo', () => {
  it('bar on the left, line on the right by default; markByAxis switches marks; a trunc date still draws categories for bars', () => {
    const zone = dim('zone'); const p = measure('price', 'avg'); const q = measure('demand', 'sum'); const r = measure('ordc', 'sum');
    const result = makeResult([resultDim(zone.id, ['N', 'S'])], [resultMeasure(p.id, [1, 2]), resultMeasure(q.id, [10, 20]), resultMeasure(r.id, [5, 6])]);
    const o = buildOption(ctx(makeSpec('combo', { columns: [zone], rows: [p, q, r] }), result));
    const s = o.series as S[];
    expect(s.map((x) => [x.type, x.yAxisIndex])).toEqual([['bar', 0], ['line', 1], ['line', 1]]);
    expect((o.yAxis as Axis[]).length).toBe(2);
    expect(s[1]!.name).toBe('SUM(demand) (right)');
    const area = makeSpec('combo', { columns: [zone], rows: [p, q] }, (sp) => { sp.marks.markByAxis = { primary: 'line', secondary: 'area' }; });
    const sa = buildOption(ctx(area, result)).series as S[];
    expect(sa[0]!.type).toBe('line');
    expect(sa[1]!.areaStyle).toBeDefined();
    const t = date('ts', 'month', 'trunc');
    const tr = makeResult([resultDim(t.id, [day(2024, 2, 1), day(2024, 1, 1)])], [resultMeasure(p.id, [2, 1]), resultMeasure(q.id, [20, 10])]);
    const ot = buildOption(ctx(makeSpec('combo', { columns: [t], rows: [p, q] }), tr));
    expect((ot.xAxis as Axis).type).toBe('category');
    expect((ot.series as S[])[0]!.data).toEqual([1, 2]);
    expect((ot.series as S[])[1]!.data).toEqual([10, 20]);
  });

  it('a single measure is a plain bar chart on one axis', () => {
    const zone = dim('zone'); const p = measure('price');
    const o = buildOption(ctx(makeSpec('combo', { columns: [zone], rows: [p] }), makeResult([resultDim(zone.id, ['N'])], [resultMeasure(p.id, [1])])));
    expect(Array.isArray(o.yAxis)).toBe(false);
    expect((o.series as S[])[0]!.type).toBe('bar');
  });
});

describe('stacked and 100 % area', () => {
  const fx = () => {
    const t = date('ts', 'month', 'trunc'); const zone = dim('zone'); const p = measure('price');
    const months = [day(2024, 1, 1), day(2024, 2, 1), day(2024, 1, 1), day(2024, 2, 1)];
    return { t, zone, p, result: makeResult([resultDim(t.id, months), resultDim(zone.id, ['N', 'N', 'S', 'S'])], [resultMeasure(p.id, [10, 30, 30, -10])]) };
  };

  it('area-stacked stacks even when marks.stacking is none', () => {
    const { t, zone, p, result } = fx();
    const spec = makeSpec('area-stacked', { columns: [t], rows: [p], color: [zone] }, (s) => { s.marks.stacking = 'none'; });
    const s = buildOption(ctx(spec, result)).series as S[];
    expect(s.every((x) => x.stack === 'total' && x.areaStyle !== undefined)).toBe(true);
  });

  it('area-100 turns columns into shares, drops negatives from the denominator and fixes the axis to 1', () => {
    const { t, zone, p, result } = fx();
    const o = buildOption(ctx(makeSpec('area-100', { columns: [t], rows: [p], color: [zone] }), result));
    const s = o.series as S[];
    expect((s[0]!.data as number[][])[0]![1]).toBeCloseTo(0.25);
    expect((s[1]!.data as number[][])[0]![1]).toBeCloseTo(0.75);
    expect((s[0]!.data as number[][])[1]![1]).toBeCloseTo(1);
    expect((s[1]!.data as Array<[number, number | null]>)[1]![1]).toBeNull();
    expect((o.yAxis as Axis).max).toBe(1);
    expect((o.__meta as { excludedNegatives: number }).excludedNegatives).toBe(1);
  });
});

describe('envelope (D-15)', () => {
  const hour = dim('hour'); const p = measure('price', 'avg');

  it('envelopeLevels lists low/high per band outer first, then the median once', () => {
    expect(envelopeLevels(makeSpec('envelope', {}))).toEqual([5, 95, 25, 75, 50]);
    expect(envelopeLevels(makeSpec('envelope', {}, (s) => { s.envelope = { mode: 'percentile', levels: [[10, 90], [40, 50]] }; }))).toEqual([10, 90, 40, 50]);
  });

  it('percentile mode: nested bands as base + span stacks, a median line, legend names the levels', () => {
    const result = makeResult([resultDim(hour.id, ['0', '1', '2'])], [resultMeasure(p.id, [10, 20, 30])]);
    result.bands = [[5, 10, 15], [15, 30, 45], [8, 16, 24], [12, 24, 36], [10, 20, 30]].map((a) => Float64Array.from(a));
    const o = buildOption(ctx(makeSpec('envelope', { columns: [hour], rows: [p] }), result));
    const s = o.series as S[];
    expect(s).toHaveLength(5);
    expect(s[0]!.data).toEqual([5, 10, 15]);
    expect(s[1]!.data).toEqual([10, 20, 30]);
    expect(s[0]!.stack).toBe(s[1]!.stack);
    expect(s[2]!.stack).not.toBe(s[0]!.stack);
    expect(s[3]!.data).toEqual([4, 8, 12]);
    expect(s[4]!.data).toEqual([10, 20, 30]);
    expect(((s[1]!.areaStyle as { opacity: number }).opacity)).toBeLessThan((s[3]!.areaStyle as { opacity: number }).opacity);
    expect((o.legend as { data: string[] }).data).toEqual(['P5–P95', 'P25–P75', 'Median price']);
    expect((o.__meta as { levels: string[] }).levels).toEqual(['P5–P95', 'P25–P75']);
  });

  it('percentile mode without result.bands fails with a clear message naming QueryPlan.bands', () => {
    const result = makeResult([resultDim(hour.id, ['0', '1'])], [resultMeasure(p.id, [1, 2])]);
    expect(tryBuildOption(ctx(makeSpec('envelope', { columns: [hour], rows: [p] }), result))).toMatchObject({ ok: false, error: expect.stringMatching(/QueryPlan\.bands/) });
  });

  it('columns mode: low/high(/mid) pills by field name, time x sorted, no median without a mid pill', () => {
    const t = date('ts', 'day', 'trunc'); const lo = measure('p10'); const hi = measure('p90'); const mid = measure('p50');
    const result = makeResult([resultDim(t.id, [day(2024, 1, 2), day(2024, 1, 1)])], [resultMeasure(hi.id, [9, 8]), resultMeasure(lo.id, [1, 2]), resultMeasure(mid.id, [5, 5])]);
    const spec = makeSpec('envelope', { columns: [t], rows: [hi, lo, mid] }, (s) => { s.envelope = { mode: 'columns', levels: [], low: 'p10', high: 'p90', mid: 'p50' }; });
    const o = buildOption(ctx(spec, result));
    const s = o.series as S[];
    expect(s).toHaveLength(3);
    expect(s[0]!.data).toEqual([[day(2024, 1, 1), 2], [day(2024, 1, 2), 1]]);
    expect(s[1]!.data).toEqual([[day(2024, 1, 1), 6], [day(2024, 1, 2), 8]]);
    expect(s[2]!.name).toBe('SUM(p50)');
    expect((o.xAxis as Axis).type).toBe('time');
    const noMid = makeSpec('envelope', { columns: [t], rows: [lo, hi] }, (sp) => { sp.envelope = { mode: 'columns', levels: [] }; });
    expect((buildOption(ctx(noMid, result)).series as S[])).toHaveLength(2);
  });
});

describe('maps (D-13, D-17)', () => {
  const zone = dim('zone'); const p = measure('price', 'avg'); const q = measure('demand', 'sum');
  const rows = () => makeResult([resultDim(zone.id, ['North', 'South', 'West'])], [resultMeasure(p.id, [30, 45, null]), resultMeasure(q.id, [10, 40, 20])]);
  const withLayer = (s: VizSpec) => { s.geoLayer = 'test-zones'; };

  it('geo roles: override → inferred → none (a name alone means nothing); the layer follows the role or the spec', () => {
    const spec = makeSpec('map-choropleth', { columns: [zone], color: [p] });
    expect(geoRoleFor(spec, [], 'zone')).toBeNull();
    expect(mapLayerId(spec, [])).toBeUndefined();
    expect(mapLayerId(spec, [{ ...fieldMeta('zone'), geoRole: 'ercot-zone' }])).toBe('ercot-zones');
    const inferred = { ...fieldMeta('zone'), geoRole: 'us-state' as const };
    expect(geoRoleFor(spec, [inferred], 'zone')).toBe('us-state');
    expect(geoRoleFor(spec, [{ ...fieldMeta('zone'), geoRole: null }], 'zone')).toBeNull();
    spec.typeOverrides.zone = { geoRole: 'country' };
    expect(geoRoleFor(spec, [inferred], 'zone')).toBe('country');
    spec.geoLayer = 'us-counties';
    expect(mapLayerId(spec, [])).toBe('us-counties');
  });

  it('an unloaded layer yields a pending option instead of throwing', () => {
    const o = buildOption(ctx(makeSpec('map-choropleth', { columns: [zone], color: [p] }), rows(), [{ ...fieldMeta('zone'), geoRole: 'ercot-zone' }]));
    expect(o.series).toEqual([]);
    expect(o.__meta).toMatchObject({ geoPending: true, geoLayer: 'ercot-zones' });
  });

  it('fill: a map series joined on the best key property, visualMap over the values, unmatched values reported', () => {
    const o = buildOption(ctx(makeSpec('map-choropleth', { columns: [zone], color: [p] }, withLayer), rows()));
    const s = (o.series as S[])[0]!;
    expect(s.type).toBe('map');
    expect(s.map).toBe('test-zones');
    expect(s.nameProperty).toBe('zone');
    expect((s.data as Array<{ name: string; value?: number }>).map((d) => [d.name, d.value])).toEqual([['North', 30], ['South', 45]]);
    expect((o.visualMap as { min: number; max: number }).min).toBe(30);
    expect((o.visualMap as { min: number; max: number }).max).toBe(45);
    expect((o.__meta as { unmatched: string[]; matched: number }).unmatched).toEqual(['West']);
    expect((o.__meta as { matched: number }).matched).toBe(2);
    expect(o.geo).toBeUndefined();
  });

  it('fill joins on codes too (nameProperty follows the matching property)', () => {
    const o = buildOption(ctx(makeSpec('map-choropleth', { columns: [zone], color: [p] }, withLayer), makeResult([resultDim(zone.id, ['n', 's'])], [resultMeasure(p.id, [1, 2])])));
    expect(((o.series as S[])[0]!).nameProperty).toBe('code');
    expect((o.__meta as { unmatched: string[] }).unmatched).toEqual([]);
  });

  it('label mark shows region labels without a color scale', () => {
    const o = buildOption(ctx(makeSpec('map-choropleth', { columns: [zone], color: [p] }, (s) => { withLayer(s); s.marks.mapMark = 'label'; }), rows()));
    const s = (o.series as S[])[0]!;
    expect((s.label as { show: boolean }).show).toBe(true);
    expect(o.visualMap).toBeUndefined();
  });

  it('symbol: scatter on the geo coordinate system at region centroids; bubble sizes by the Size measure', () => {
    const o = buildOption(ctx(makeSpec('map-symbol', { columns: [zone], color: [p] }, withLayer), rows()));
    expect((o.geo as { map: string }).map).toBe('test-zones');
    const s = (o.series as S[])[0]!;
    expect(s.type).toBe('scatter');
    expect(s.coordinateSystem).toBe('geo');
    const pts = s.data as Array<[number, number, number, string]>;
    expect(pts.map((d) => [d[0], d[1], d[3]])).toEqual([[0.5, 1.5, 'North'], [0.5, 0.5, 'South']]);
    expect(typeof s.symbolSize).toBe('number');
    expect((o.visualMap as { dimension: number }).dimension).toBe(2);
    expect((o.__meta as { unplaced: number }).unplaced).toBe(1);
    const b = buildOption(ctx(makeSpec('map-symbol', { columns: [zone], size: [q] }, withLayer), rows()));
    const bs = (b.series as S[])[0]!;
    expect(typeof bs.symbolSize).toBe('function');
    const sizeOf = bs.symbolSize as (d: unknown[]) => number;
    expect(sizeOf(bs.data[1] as unknown[])).toBeCloseTo(40);
    expect(sizeOf(bs.data[0] as unknown[])).toBeCloseTo(6 + 34 * Math.sqrt(10 / 40));
    expect((b.__meta as { mark: string }).mark).toBe('bubble');
  });

  it('symbol from latitude + longitude measures (inferred roles), grouped by a Color dimension, shapes from the Shape shelf', () => {
    const lat = measure('lat', 'none'); const lon = measure('lon', 'none'); const site = dim('site'); const fuel = dim('fuel');
    const result = makeResult([resultDim(site.id, ['a', 'b', 'c']), resultDim(fuel.id, ['Wind', 'Solar', 'Wind'])], [resultMeasure(lat.id, [30, 31, 32]), resultMeasure(lon.id, [-100, -99, -98]), resultMeasure(q.id, [1, 2, 3])]);
    const spec = makeSpec('map-symbol', { columns: [lon], rows: [lat], detail: [site], color: [fuel], shape: [fuel], size: [q] }, (s) => { s.geoLayer = 'test-zones'; s.marks.shapeSet = 'power-gen'; });
    const o = buildOption(ctx(spec, result, [{ ...fieldMeta('lat', 'number'), geoRole: 'latitude' }, { ...fieldMeta('lon', 'number'), geoRole: 'longitude' }]));
    const s = o.series as S[];
    expect(s.map((x) => x.name)).toEqual(['Wind', 'Solar']);
    expect((s[0]!.data as number[][]).map((d) => [d[0], d[1]])).toEqual([[-100, 30], [-98, 32]]);
    expect(typeof s[0]!.symbol).toBe('function');
    expect((s[0]!.symbol as (v: unknown[], p: { data: unknown[] }) => string)([], { data: s[0]!.data[0] as unknown[] })).toMatch(/^path:\/\//);
    expect((o.__meta as { latLon: boolean }).latLon).toBe(true);
    expect((o.__meta as { shapeSet: string }).shapeSet).toBe('power-gen');
  });

  it('heat: a heatmap series over [lon, lat, value]', () => {
    const o = buildOption(ctx(makeSpec('map-symbol', { columns: [zone], color: [p] }, (s) => { withLayer(s); s.marks.mapMark = 'heat'; }), rows()));
    const s = (o.series as S[])[0]!;
    expect(s.type).toBe('heatmap');
    expect(s.data).toEqual([[0.5, 1.5, 30], [0.5, 0.5, 45]]);
  });

  it('without a geographic field the builder says what is needed', () => {
    const fuel = dim('fuel');
    expect(tryBuildOption(ctx(makeSpec('map-choropleth', { columns: [fuel], color: [p] }), makeResult([resultDim(fuel.id, ['a'])], [resultMeasure(p.id, [1])])))).toMatchObject({ ok: false, error: expect.stringMatching(/geographic field/) });
  });
});

describe('reference lines and bands', () => {
  const base = () => {
    const zone = dim('zone'); const p = measure('price', 'avg');
    return { zone, p, result: makeResult([resultDim(zone.id, ['North', 'South', 'West'])], [resultMeasure(p.id, [30, 45, null])]) };
  };

  it('average / median / percentile / constant lines as markLine on the first series of the axis', () => {
    const { zone, p, result } = base();
    const spec = makeSpec('bar', { columns: [zone], rows: [p] }, (s) => {
      s.referenceLines = [
        { id: 'a', axis: 'y', kind: 'average', dash: true, scope: 'all' },
        { id: 'm', axis: 'y', kind: 'median', dash: false, scope: 'all', label: 'Mid', color: '#ff0000' },
        { id: 'p', axis: 'y', kind: 'percentile', value: 100, dash: true, scope: 'all' },
        { id: 'c', axis: 'y', kind: 'constant', value: 40, dash: false, scope: 'all' },
      ];
    });
    const s = (buildOption(ctx(spec, result)).series as S[])[0]!;
    const items = (s.markLine as { data: Array<{ yAxis: number; name: string; lineStyle: { type: string; color: string } }> }).data;
    expect(items.map((i) => i.yAxis)).toEqual([37.5, 37.5, 45, 40]);
    expect(items[0]!.name).toBe('Avg 37.5');
    expect(items[0]!.lineStyle.type).toBe('dashed');
    expect(items[1]!.name).toBe('Mid');
    expect(items[1]!.lineStyle.color).toBe('#ff0000');
    expect(items[2]!.name).toBe('P100 45');
  });

  it('bands become markArea from/to statistics; per-series scope draws on every series; y2 targets the right axis', () => {
    const zone = dim('zone'); const p = measure('price', 'avg'); const q = measure('demand', 'sum', { axis: 'secondary' });
    const result = makeResult([resultDim(zone.id, ['N', 'S'])], [resultMeasure(p.id, [10, 30]), resultMeasure(q.id, [100, 300])]);
    const spec = makeSpec('line', { columns: [zone], rows: [p, q] }, (s) => {
      s.referenceLines = [
        { id: 'b', axis: 'y', kind: 'band', from: 'min', to: 'average', dash: false, scope: 'all' },
        { id: 'r', axis: 'y2', kind: 'max', dash: true, scope: 'all' },
        { id: 's', axis: 'y', kind: 'average', dash: true, scope: 'per-series' },
      ];
    });
    const s = buildOption(ctx(spec, result)).series as S[];
    const area = (s[0]!.markArea as { data: Array<[{ yAxis: number }, { yAxis: number }]> }).data;
    expect(area[0]![0].yAxis).toBe(10);
    expect(area[0]![1].yAxis).toBe(20);
    expect((s[1]!.markLine as { data: Array<{ yAxis: number }> }).data[0]!.yAxis).toBe(300);
    expect((s[0]!.markLine as { data: Array<{ yAxis: number }> }).data.map((d) => d.yAxis)).toEqual([20]);
  });

  it('a statistic on a category x axis is skipped with a note; a constant names a category; horizontal bars flip the key', () => {
    const { zone, p, result } = base();
    const spec = makeSpec('bar', { columns: [zone], rows: [p] }, (s) => {
      s.referenceLines = [{ id: 'x', axis: 'x', kind: 'average', dash: false, scope: 'all' }, { id: 'k', axis: 'x', kind: 'constant', value: 'South' as unknown as number, dash: false, scope: 'all' }];
    });
    const o = buildOption(ctx(spec, result));
    expect((o.__meta as { notes: string[] }).notes[0]).toMatch(/category axis/);
    expect(((o.series as S[])[0]!.markLine as { data: Array<{ xAxis: number }> }).data[0]!.xAxis).toBe(1);
    const h = makeSpec('bar-h', { rows: [zone], columns: [p] }, (s) => { s.referenceLines = [{ id: 'a', axis: 'y', kind: 'average', dash: true, scope: 'all' }]; });
    expect(((buildOption(ctx(h, result)).series as S[])[0]!.markLine as { data: Array<{ xAxis: number }> }).data[0]!.xAxis).toBe(37.5);
  });
});

describe('trend lines', () => {
  it('a dashed line series per data series from the fit; time axes fit on days; equation and R² in __meta-free trendInfo via the tooltip', () => {
    const t = date('ts', 'day', 'trunc'); const p = measure('price', 'avg');
    const xs = [day(2024, 1, 1), day(2024, 1, 2), day(2024, 1, 3), day(2024, 1, 4)];
    const result = makeResult([resultDim(t.id, xs)], [resultMeasure(p.id, [1, 3, 5, 7])]);
    const spec = makeSpec('line', { columns: [t], rows: [p] }, (s) => { s.trendLine = { enabled: true, model: 'linear', perSeries: true, showEquation: true }; });
    const o = buildOption(ctx(spec, result));
    const s = o.series as S[];
    expect(s).toHaveLength(2);
    expect(s[1]!.name).toBe('AVG(price) trend');
    expect((s[1]!.lineStyle as { type: string }).type).toBe('dashed');
    const pts = s[1]!.data as number[][];
    expect(pts.map((d) => d[0])).toEqual(xs);
    pts.forEach((d, i) => expect(d[1]).toBeCloseTo(1 + 2 * i));
    expect((o.legend as { data: string[] }).data).toEqual(['AVG(price)']);
    const fmt = (o.tooltip as { formatter: (p: unknown) => string }).formatter;
    const html = fmt([{ seriesName: 'AVG(price) trend', seriesIndex: 1, value: [xs[0], 1], color: '#000', axisValue: xs[0] }]);
    expect(html).toMatch(/y = 1 \+ 2x/);
    expect(html).toMatch(/R² 1\.000/);
    spec.trendLine.showEquation = false;
    const quiet = (buildOption(ctx(spec, result)).tooltip as { formatter: (p: unknown) => string }).formatter([{ seriesName: 'AVG(price) trend', seriesIndex: 1, value: [xs[0], 1], color: '#000' }]);
    expect(quiet).not.toMatch(/trend/);
  });

  it('perSeries false pools every series into one "All trend"; a poly fit on categories uses the index', () => {
    const zone = dim('zone'); const fuel = dim('fuel'); const p = measure('price');
    const result = makeResult([resultDim(zone.id, ['a', 'b', 'c', 'a', 'b', 'c']), resultDim(fuel.id, ['g', 'g', 'g', 'w', 'w', 'w'])], [resultMeasure(p.id, [1, 2, 3, 2, 3, 4])]);
    const spec = makeSpec('bar', { columns: [zone], rows: [p], color: [fuel] }, (s) => { s.trendLine = { enabled: true, model: 'poly', degree: 2, perSeries: false, showEquation: false }; });
    const s = buildOption(ctx(spec, result)).series as S[];
    expect(s).toHaveLength(3);
    expect(s[2]!.name).toBe('All trend');
    expect(s[2]!.type).toBe('line');
    (s[2]!.data as number[]).forEach((v, i) => expect(v).toBeCloseTo(1.5 + i));
  });

  it('scatter trend fits y on x over 50 sampled points', () => {
    const a = measure('a'); const b = measure('b');
    const result = makeResult([], [resultMeasure(a.id, [1, 2, 3, 4]), resultMeasure(b.id, [2, 4, 6, 8])]);
    const spec = makeSpec('scatter', { columns: [a], rows: [b] }, (s) => { s.trendLine = { enabled: true, model: 'linear', perSeries: true, showEquation: true }; });
    const s = buildOption(ctx(spec, result)).series as S[];
    expect(s[1]!.type).toBe('line');
    const pts = s[1]!.data as number[][];
    expect(pts).toHaveLength(50);
    expect(pts[0]![0]).toBe(1);
    expect(pts[49]![1]).toBeCloseTo(8);
  });
});

describe('annotations', () => {
  it('markPoint at the data position with the pixel offset; anchors exposed for the canvas; unknown x noted', () => {
    const zone = dim('zone'); const p = measure('price', 'avg');
    const result = makeResult([resultDim(zone.id, ['North', 'South', 'West'])], [resultMeasure(p.id, [30, 45, null])]);
    const spec = makeSpec('bar', { columns: [zone], rows: [p] }, (s) => {
      s.annotations = [{ id: 'n1', text: 'Peak', x: 'South', offset: [4, -12] }, { id: 'n2', text: 'Nowhere', x: 'East', offset: [0, 0] }, { id: 'n3', text: 'Fixed', x: 'North', y: 10, offset: [0, 0] }];
    });
    const o = buildOption(ctx(spec, result));
    const mp = (o.series as S[])[0]!.markPoint as { data: Array<{ name: string; coord: [number, number]; label: { formatter: string; offset: [number, number] } }> };
    expect(mp.data.map((d) => [d.name, d.coord])).toEqual([['n1', [1, 45]], ['n3', [0, 10]]]);
    expect(mp.data[0]!.label.formatter).toBe('Peak');
    expect(mp.data[0]!.label.offset).toEqual([4, -12]);
    const meta = o.__meta as { annotations: Array<{ id: string; seriesIndex: number; y: number }>; notes: string[] };
    expect(meta.annotations.map((a) => [a.id, a.seriesIndex, a.y])).toEqual([['n1', 0, 45], ['n3', 0, 10]]);
    expect(meta.notes[0]).toMatch(/Nowhere/);
  });

  it('seriesKey picks the series; time x matches epoch values', () => {
    const t = date('ts', 'month', 'trunc'); const zone = dim('zone'); const p = measure('price');
    const m = [day(2024, 1, 1), day(2024, 2, 1), day(2024, 1, 1), day(2024, 2, 1)];
    const result = makeResult([resultDim(t.id, m), resultDim(zone.id, ['N', 'N', 'S', 'S'])], [resultMeasure(p.id, [1, 2, 3, 4])]);
    const spec = makeSpec('line', { columns: [t], rows: [p], color: [zone] }, (s) => { s.annotations = [{ id: 'a', text: 'S Feb', x: day(2024, 2, 1), seriesKey: 'S', offset: [0, 0] }]; });
    const s = buildOption(ctx(spec, result)).series as S[];
    expect(s[0]!.markPoint).toBeUndefined();
    expect((s[1]!.markPoint as { data: Array<{ coord: [number, number] }> }).data[0]!.coord).toEqual([day(2024, 2, 1), 4]);
  });
});

describe('style pass (D-14, D-16)', () => {
  const fx = () => {
    const zone = dim('zone'); const p = measure('price', 'avg');
    return { spec: makeSpec('bar', { columns: [zone], rows: [p] }), result: makeResult([resultDim(zone.id, ['N', 'S'])], [resultMeasure(p.id, [1, 2])]) };
  };

  it('gridlines off removes the split lines on y (and y2); x gridlines apply to value x axes', () => {
    const { spec, result } = fx();
    spec.axes.y.gridlines = false;
    expect(((buildOption(ctx(spec, result)).yAxis as Axis).splitLine!.show)).toBe(false);
    spec.axes.y.gridlines = true;
    expect(((buildOption(ctx(spec, result)).yAxis as Axis).splitLine!.show)).toBe(true);
    const a = measure('a'); const b = measure('b');
    const sc = makeSpec('scatter', { columns: [a], rows: [b] }, (s) => { s.axes.x.gridlines = false; s.axes.x.showAxis = false; });
    const x = buildOption(ctx(sc, makeResult([], [resultMeasure(a.id, [1]), resultMeasure(b.id, [2])]))).xAxis as Axis;
    expect(x.splitLine!.show).toBe(false);
    expect(x.show).toBe(false);
  });

  it('font family and scale reach the text style, axes, legend and labels; title, subtitle and caption are drawn', () => {
    const { spec, result } = fx();
    spec.style.fontFamily = 'inter';
    spec.style.fontScale = 2;
    spec.style.axis.fontFamily = 'jetbrains-mono';
    spec.style.title = { text: 'Demand by zone', size: 16, weight: 600, align: 'center' };
    spec.style.subtitle = { text: '2024', size: 12 };
    spec.style.caption = { text: 'Source: ERCOT', size: 11 };
    const o = buildOption(ctx(spec, result));
    expect((o.textStyle as { fontFamily: string }).fontFamily).toContain('Inter');
    const y = o.yAxis as Axis;
    expect(y.axisLabel!.fontSize).toBe(22);
    expect(y.axisLabel!.fontFamily).toContain('JetBrains Mono');
    expect((y.nameTextStyle as { fontSize: number }).fontSize).toBe(24);
    expect(((o.legend as { textStyle: { fontSize: number } }).textStyle.fontSize)).toBe(22);
    expect((((o.series as S[])[0]!.label) as { fontSize: number }).fontSize).toBe(22);
    const title = o.title as { show: boolean; text: string; subtext: string; left: string; textStyle: { fontSize: number; fontWeight: number } };
    expect(title.show).toBe(true);
    expect([title.text, title.subtext, title.left]).toEqual(['Demand by zone', '2024', 'center']);
    expect(title.textStyle.fontSize).toBe(32);
    expect(title.textStyle.fontWeight).toBe(600);
    const caption = (o.graphic as Array<{ type: string; style: { text: string } }>).find((g) => g.type === 'text')!;
    expect(caption.style.text).toBe('Source: ERCOT');
    expect((o.grid as { top: number }).top).toBeGreaterThan(20);
  });

  it('background, border and padding; defaults keep a transparent surface and the v1 grid', () => {
    const { spec, result } = fx();
    const d = buildOption(ctx(spec, result));
    expect(d.backgroundColor).toBe('transparent');
    expect((d.title as { show: boolean }).show).toBe(false);
    expect((d.__meta as { border: boolean }).border).toBe(false);
    expect((d.grid as { left: number }).left).toBe(12);
    spec.style.background = '#FFFFFF';
    spec.style.border = true;
    spec.style.padding = 24;
    const o = buildOption(ctx(spec, result));
    expect(o.backgroundColor).toBe('#FFFFFF');
    expect((o.__meta as { border: boolean }).border).toBe(true);
    expect((o.grid as { left: number; right: number }).left).toBe(20);
    expect((o.grid as { left: number; right: number }).right).toBe(24);
  });

  it('axis min/max, log, reversed, tick format and hidden title on x and y', () => {
    const a = measure('a'); const b = measure('b', 'sum');
    const sc = makeSpec('scatter', { columns: [a], rows: [b] }, (s) => {
      s.axes.x = { log: true, reversed: true, gridlines: true, showAxis: true, min: 1, max: 1000, title: null };
      s.axes.y = { log: false, reversed: false, gridlines: true, showAxis: true, title: 'Load', tickFormat: { kind: 'number', decimals: 1, units: 'K' } };
    });
    const o = buildOption(ctx(sc, makeResult([], [resultMeasure(a.id, [1]), resultMeasure(b.id, [2000])])));
    const x = o.xAxis as Axis; const y = o.yAxis as Axis;
    expect([x.type, x.inverse, x.min, x.max, x.name]).toEqual(['log', true, 1, 1000, undefined]);
    expect(y.name).toBe('Load');
    expect((y.axisLabel as { formatter: (v: number) => string }).formatter(2000)).toMatch(/2\.0\s?K/);
  });
});

describe('Shape shelf → icons (ICONS.md §7)', () => {
  const a = measure('a'); const b = measure('b'); const fuel = dim('fuel'); const zone = dim('zone');
  const result = makeResult([resultDim(fuel.id, ['Wind', 'Solar', 'Gas', 'Wind']), resultDim(zone.id, ['N', 'N', 'S', 'S'])], [resultMeasure(a.id, [1, 2, 3, 4]), resultMeasure(b.id, [1, 2, 3, 4])]);

  it('shape alone: one series per label with a path symbol, the legend carries the icon, the default set is basic', () => {
    const o = buildOption(ctx(makeSpec('scatter', { columns: [a], rows: [b], shape: [fuel] }), result));
    const s = o.series as S[];
    expect(s.map((x) => x.name)).toEqual(['Wind', 'Solar', 'Gas']);
    expect(s.every((x) => typeof x.symbol === 'string' && (x.symbol as string).startsWith('path://'))).toBe(true);
    expect(s[0]!.symbol).not.toBe(s[1]!.symbol);
    const legend = (o.legend as { data: Array<{ name: string; icon: string }> }).data;
    expect(legend[0]!.name).toBe('Wind');
    expect(legend[0]!.icon).toMatch(/^path:\/\//);
    expect((o.__meta as { shapeSet: string }).shapeSet).toBe('basic');
    expect(s[0]!.symbolSize).toBe(12);
    expect(new Set(s.map((x) => (x.itemStyle as { color: string }).color)).size).toBe(1);
  });

  it('power-gen set matches names; overrides win; a different Color field keeps color series and picks the icon per point', () => {
    const spec = makeSpec('scatter', { columns: [a], rows: [b], shape: [fuel] }, (s) => { s.marks.shapeSet = 'power-gen'; s.marks.shapeOverrides = { Gas: 'coal' }; });
    const o = buildOption(ctx(spec, result));
    const s = o.series as S[];
    expect(s[2]!.symbol).toBe(`path://${(o.legend as { data: Array<{ icon: string }> }).data[2]!.icon.slice('path://'.length)}`);
    expect(s[0]!.symbolSize).toBe(16);
    const mixed = buildOption(ctx(makeSpec('scatter', { columns: [a], rows: [b], shape: [fuel], color: [zone] }), result));
    const ms = mixed.series as S[];
    expect(ms.map((x) => x.name)).toEqual(['N', 'S']);
    expect(typeof ms[0]!.symbol).toBe('function');
    expect((ms[0]!.symbol as (v: unknown[]) => string)(ms[0]!.data[0] as unknown[])).toMatch(/^path:\/\//);
    expect((mixed.legend as { data: string[] }).data).toEqual(['N', 'S']);
  });
});

describe('latitude / longitude without an area role (T6)', () => {
  it('draws on the default layer instead of failing, and a spec layer still wins', () => {
    const lat = measure('lat', 'none'); const lon = measure('lon', 'none');
    const meta = [{ ...fieldMeta('lat', 'number'), geoRole: 'latitude' as const }, { ...fieldMeta('lon', 'number'), geoRole: 'longitude' as const }];
    const spec = makeSpec('map-symbol', { columns: [lon], rows: [lat] });
    expect(mapLayerId(spec, meta)).toBe('us-states');
    expect(mapLayerId(spec, [])).toBeUndefined();
    spec.geoLayer = 'ercot-zones';
    expect(mapLayerId(spec, meta)).toBe('ercot-zones');
  });
});

describe('a lone secondary-axis measure (T6)', () => {
  it('draws on the primary axis with one y axis, even when axes are synchronized', () => {
    const zone = dim('zone'); const p = measure('price', 'avg', { axis: 'secondary' });
    const result = makeResult([resultDim(zone.id, ['N', 'S'])], [resultMeasure(p.id, [10, 20])]);
    const spec = makeSpec('bar', { columns: [zone], rows: [p] }, (s) => { s.axes.synchronized = true; });
    const o = buildOption(ctx(spec, result));
    const axes = (Array.isArray(o.yAxis) ? o.yAxis : [o.yAxis]) as Axis[];
    expect(axes).toHaveLength(1);
    const s = (o.series as S[])[0]!;
    expect(s.name).toBe('AVG(price)');
    expect(s.yAxisIndex ?? 0).toBe(0);
    expect(axes[0]!.max).toBeUndefined();
  });
});

describe('coordinate marks fit the view to the data (T6)', () => {
  const close = (got: unknown, want: number[][]) => (got as number[][]).forEach((pair, i) => pair.forEach((v, j) => expect(v).toBeCloseTo(want[i]![j]!, 6)));
  it('sets geo.boundingCoords from the padded lon/lat extent; centroid marks on a region layer do not', () => {
    close(fitViewToPoints([[-100, -96], [28, 32]]), [[-100.6, 27.4], [-95.4, 32.6]]);
    // A single point still gets a FIT_MIN_SPAN-degree window.
    close(fitViewToPoints([[-95.4, -95.4], [29.8, 29.8]]), [[-96.7, 28.5], [-94.1, 31.1]]);
    const lat = measure('lat', 'none'); const lon = measure('lon', 'none'); const site = dim('site');
    const result = makeResult([resultDim(site.id, ['a', 'b'])], [resultMeasure(lat.id, [30, 32]), resultMeasure(lon.id, [-100, -96])]);
    const spec = makeSpec('map-symbol', { columns: [lon], rows: [lat], detail: [site] }, (s) => { s.geoLayer = 'test-zones'; });
    const o = buildOption(ctx(spec, result, [{ ...fieldMeta('lat', 'number'), geoRole: 'latitude' }, { ...fieldMeta('lon', 'number'), geoRole: 'longitude' }]));
    close((o.geo as { boundingCoords: unknown }).boundingCoords, [[-100.6, 29.7], [-95.4, 32.3]]);
    const zone = dim('zone'); const p = measure('price', 'avg');
    const byRegion = buildOption(ctx(makeSpec('map-symbol', { columns: [zone], color: [p] }, (s) => { s.geoLayer = 'test-zones'; }), makeResult([resultDim(zone.id, ['North', 'South'])], [resultMeasure(p.id, [1, 2])])));
    expect((byRegion.geo as { boundingCoords?: unknown }).boundingCoords).toBeUndefined();
    // With coordinates, a Detail dimension is a label, not a region to join: nothing is reported unmatched.
    expect((o.__meta as { unmatched: string[]; points: number }).unmatched).toEqual([]);
    expect((o.__meta as { points: number }).points).toBe(2);
  });
});
