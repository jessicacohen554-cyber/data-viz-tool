/**
 * One build per chart id on a fixture QueryResult (plain objects, no canvas):
 * asserts the structure docs/CHARTS.md promises (series type, counts, data
 * shape), never a snapshot of numbers the test did not compute.
 */
import { describe, expect, it } from 'vitest';
import type { ChartTypeId, QueryResult, VizSpec } from '../core/types';
import { CHART_TYPE_IDS } from '../core/constants';
import type { BuildContext } from './registry';
import { REPLACE_MERGE_KEYS, buildOption, rendererOf, tryBuildOption } from './spec-builder';
import { date, day, dim, makeResult, makeSpec, measure, resultDim, resultMeasure, trivial } from './test-fixtures';
import type { TableModel } from './types/text-table';
import type { KpiModel } from './types/kpi';
import type { HighlightModel } from './types/highlight-table';

type Series = Record<string, unknown> & { type: string; data: unknown[] };

function ctx(spec: VizSpec, result: QueryResult, isMobile = false): BuildContext {
  return { spec, result, meta: [], isMobile };
}

/** Fixture per chart id: zone × fuel × month, with the measures each type needs. */
function fixture(id: ChartTypeId): { spec: VizSpec; result: QueryResult } {
  const zone = dim('zone'); const fuel = dim('fuel'); const t = date('ts', 'month', 'trunc'); const tDay = date('ts', 'day', 'trunc');
  const p = measure('price', 'avg'); const q = measure('demand', 'sum'); const r = measure('ordc', 'sum');
  const months = [day(2024, 1, 1), day(2024, 2, 1), day(2024, 3, 1), day(2024, 1, 1), day(2024, 2, 1), day(2024, 3, 1)];
  const zones6 = ['North', 'North', 'North', 'South', 'South', 'South'];
  const fuels6 = ['Gas', 'Wind', 'Solar', 'Gas', 'Wind', 'Solar'];
  const vals6 = [10, 20, 30, 15, null, 35];
  const two = (dims: ReturnType<typeof resultDim>[], ms: ReturnType<typeof resultMeasure>[]) => makeResult(dims, ms);
  switch (id) {
    case 'bar': case 'bar-h': case 'pie': case 'donut': case 'funnel': case 'treemap': case 'waterfall': case 'lollipop': case 'highlight-table': case 'text-table': {
      const { spec, result } = trivial();
      spec.chartType = id;
      return { spec, result };
    }
    case 'bar-grouped': case 'bar-stacked': case 'bar-stacked-100': case 'sunburst': case 'sankey':
      return { spec: makeSpec(id, { columns: [zone], rows: [p], color: [fuel] }), result: two([resultDim(zone.id, zones6), resultDim(fuel.id, fuels6)], [resultMeasure(p.id, vals6)]) };
    case 'heatmap':
      return { spec: makeSpec(id, { columns: [zone], rows: [fuel], color: [p] }), result: two([resultDim(zone.id, zones6), resultDim(fuel.id, fuels6)], [resultMeasure(p.id, vals6)]) };
    case 'line': case 'area':
      return { spec: makeSpec(id, { columns: [t], rows: [p] }), result: two([resultDim(t.id, months.slice(0, 3))], [resultMeasure(p.id, [1, 2, 3])]) };
    case 'streamgraph': case 'bump':
      return { spec: makeSpec(id, { columns: [t], rows: [p], color: [zone] }), result: two([resultDim(t.id, months), resultDim(zone.id, zones6)], [resultMeasure(p.id, vals6)]) };
    case 'calendar-heatmap':
      return { spec: makeSpec(id, { columns: [tDay], color: [p] }), result: two([resultDim(tDay.id, [day(2024, 2, 28), day(2024, 2, 29), day(2025, 1, 1)])], [resultMeasure(p.id, [1, 2, 3])]) };
    case 'scatter': case 'parallel':
      return { spec: makeSpec(id, { columns: [p], rows: [q], color: [zone] }), result: two([resultDim(zone.id, zones6)], [resultMeasure(p.id, vals6), resultMeasure(q.id, [1, 2, 3, 4, 5, 6])]) };
    case 'bubble':
      return { spec: makeSpec(id, { columns: [p], rows: [q], size: [r] }), result: two([], [resultMeasure(p.id, [1, 2, 3]), resultMeasure(q.id, [4, 5, 6]), resultMeasure(r.id, [10, -1, 40])]) };
    case 'gauge':
      return { spec: makeSpec(id, { label: [p], tooltip: [q] }), result: two([], [resultMeasure(p.id, [72]), resultMeasure(q.id, [90])]) };
    case 'kpi':
      return { spec: makeSpec(id, { label: [p], tooltip: [q] }), result: two([], [resultMeasure(p.id, [1234.5]), resultMeasure(q.id, [-3])]) };
    case 'histogram': {
      const binned = measure('price', 'sum', { bin: { count: 3 }, continuity: 'discrete' }); const cnt = measure('price', 'count');
      return { spec: makeSpec(id, { columns: [binned], rows: [cnt] }), result: two([resultDim(binned.id, ['0', '10', '20'])], [resultMeasure(cnt.id, [5, 0, 2])]) };
    }
    case 'boxplot': {
      const raw = measure('price', 'none');
      const result = two([resultDim(zone.id, ['North', 'South'])], [resultMeasure(raw.id, [0, 0])]);
      result.boxstats = { q1: Float64Array.from([2, 3]), med: Float64Array.from([3, 4]), q3: Float64Array.from([4, 5]), lo: Float64Array.from([1, 2]), hi: Float64Array.from([5, 6]), outliers: [Float64Array.from([9, 10]), new Float64Array(0)] };
      return { spec: makeSpec(id, { columns: [zone], rows: [raw] }), result };
    }
    case 'bullet': case 'dumbbell':
      return { spec: makeSpec(id, { columns: [zone], rows: [p, q] }), result: two([resultDim(zone.id, ['North', 'South', 'West'])], [resultMeasure(p.id, [30, 45, null]), resultMeasure(q.id, [40, 40, 50])]) };
    case 'radar':
      return { spec: makeSpec(id, { rows: [p, q, r], color: [zone] }), result: two([resultDim(zone.id, ['North', 'South'])], [resultMeasure(p.id, [1, 2]), resultMeasure(q.id, [3, 4]), resultMeasure(r.id, [5, null])]) };
    case 'slope': {
      const yr = dim('year');
      return { spec: makeSpec(id, { columns: [yr], rows: [p], color: [zone] }), result: two([resultDim(yr.id, ['2023', '2024', '2023', '2024']), resultDim(zone.id, ['North', 'North', 'South', 'South'])], [resultMeasure(p.id, [1, 3, 2, 1])]) };
    }
    case 'candlestick': {
      const [o, c, l, h] = [measure('open'), measure('close'), measure('low'), measure('high')];
      return { spec: makeSpec(id, { columns: [tDay], rows: [o, c, l, h] }), result: two([resultDim(tDay.id, [day(2024, 1, 2), day(2024, 1, 1)])], [resultMeasure(o.id, [10, 11]), resultMeasure(c.id, [12, 9]), resultMeasure(l.id, [9, 8]), resultMeasure(h.id, [13, 12])]) };
    }
  }
}

describe('buildOption per chart id', () => {
  it.each(CHART_TYPE_IDS)('%s builds from its fixture without throwing', (id) => {
    const { spec, result } = fixture(id);
    const out = tryBuildOption(ctx(spec, result));
    expect(out.ok, out.ok ? '' : out.error).toBe(true);
    expect(out.renderer).toBe(rendererOf(id));
    const option = buildOption(ctx(spec, result));
    if (out.renderer === 'echarts') {
      expect(Array.isArray(option.series)).toBe(true);
      expect((option.series as Series[]).length).toBeGreaterThan(0);
      expect(option.tooltip).toBeDefined();
      expect(typeof option.animation).toBe('boolean');
    } else {
      expect(option.renderer).toBe('dom');
    }
  });

  it('bar: one series, a null measure draws no bar, category axis carries the labels', () => {
    const { spec, result } = fixture('bar');
    const o = buildOption(ctx(spec, result));
    const s = (o.series as Series[])[0]!;
    expect(s.type).toBe('bar');
    expect(s.data).toEqual([30, 45, null]);
    expect((o.xAxis as { data: string[] }).data).toEqual(['North', 'South', 'West']);
    expect((o.legend as { show: boolean }).show).toBe(false);
  });

  it('bar-h swaps axes; grouped and stacked bars make one series per color value in palette order', () => {
    const h = buildOption(ctx(...Object.values(fixture('bar-h')) as [VizSpec, QueryResult]));
    expect((h.yAxis as { type: string }).type).toBe('category');
    expect((h.xAxis as { type: string }).type).toBe('value');
    const g = buildOption(ctx(...Object.values(fixture('bar-grouped')) as [VizSpec, QueryResult]));
    const gs = g.series as Series[];
    expect(gs.map((s) => s.name)).toEqual(['Gas', 'Wind', 'Solar']);
    expect(gs.every((s) => s.stack === undefined)).toBe(true);
    expect(gs[1]!.data).toEqual([20, null]);
    const st = buildOption(ctx(...Object.values(fixture('bar-stacked')) as [VizSpec, QueryResult]));
    expect((st.series as Series[]).every((s) => s.stack === 'total')).toBe(true);
    expect((st.legend as { show: boolean }).show).toBe(true);
  });

  it('bar-stacked-100 turns values into shares of the column', () => {
    const o = buildOption(ctx(...Object.values(fixture('bar-stacked-100')) as [VizSpec, QueryResult]));
    const s = o.series as Series[];
    const north = s.map((x) => x.data[0] as number);
    expect(north.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect((o.yAxis as { max: number }).max).toBe(1);
  });

  it('line on a trunc date uses a time axis with [t, v] points and inside dataZoom', () => {
    const o = buildOption(ctx(...Object.values(fixture('line')) as [VizSpec, QueryResult]));
    expect((o.xAxis as { type: string }).type).toBe('time');
    const s = (o.series as Series[])[0]!;
    expect(s.data).toEqual([[day(2024, 1, 1), 1], [day(2024, 2, 1), 2], [day(2024, 3, 1), 3]]);
    expect(s.sampling).toBeUndefined();
    expect((o.dataZoom as unknown[]).length).toBe(1);
  });

  it('line: nullHandling zero fills, connect bridges; LTTB engages above 2K points', () => {
    const t = date('ts', 'month', 'trunc'); const p = measure('p');
    const result = makeResult([resultDim(t.id, [1, 2, 3])], [resultMeasure(p.id, [1, null, 3])]);
    const zero = makeSpec('line', { columns: [t], rows: [p] }, (s) => { s.marks.nullHandling = 'zero'; });
    expect(((buildOption(ctx(zero, result)).series as Series[])[0]!.data as number[][])[1]![1]).toBe(0);
    const connect = makeSpec('line', { columns: [t], rows: [p] }, (s) => { s.marks.nullHandling = 'connect'; });
    expect((buildOption(ctx(connect, result)).series as Series[])[0]!.connectNulls).toBe(true);
    const n = 2500;
    const big = makeResult([resultDim(t.id, Array.from({ length: n }, (_, i) => i))], [resultMeasure(p.id, Array.from({ length: n }, (_, i) => i))]);
    const o = buildOption(ctx(makeSpec('line', { columns: [t], rows: [p] }), big));
    expect((o.series as Series[])[0]!.sampling).toBe('lttb');
  });

  it('area stacks by default and overlays at reduced opacity when stacking is none', () => {
    const { spec, result } = fixture('area');
    spec.marks.stacking = 'stack';
    expect((buildOption(ctx(spec, result)).series as Series[])[0]!.stack).toBe('total');
    spec.marks.stacking = 'none';
    const s = (buildOption(ctx(spec, result)).series as Series[])[0]!;
    expect(s.stack).toBeUndefined();
    expect((s.areaStyle as { opacity: number }).opacity).toBeLessThanOrEqual(0.5);
  });

  it('streamgraph emits [date, value, name] triples and rejects < 3 dates', () => {
    const o = buildOption(ctx(...Object.values(fixture('streamgraph')) as [VizSpec, QueryResult]));
    const d = (o.series as Series[])[0]!.data as Array<[number, number, string]>;
    expect(d).toHaveLength(5);
    expect(d[0]).toEqual([day(2024, 1, 1), 10, 'North']);
    const t = date('ts', 'month', 'trunc'); const p = measure('p'); const z = dim('zone');
    const small = makeResult([resultDim(t.id, [1, 2]), resultDim(z.id, ['a', 'b'])], [resultMeasure(p.id, [1, 2])]);
    expect(tryBuildOption(ctx(makeSpec('streamgraph', { columns: [t], rows: [p], color: [z] }), small))).toMatchObject({ ok: false, error: expect.stringMatching(/3 dates/) });
  });

  it('scatter groups by color, skips null points, goes large above 2K points', () => {
    const o = buildOption(ctx(...Object.values(fixture('scatter')) as [VizSpec, QueryResult]));
    const s = o.series as Series[];
    expect(s.map((x) => x.name)).toEqual(['North', 'South']);
    expect(s[1]!.data).toHaveLength(2);
    expect(s[0]!.large).toBe(false);
    const p = measure('p'); const q = measure('q');
    const n = 3000;
    const big = makeResult([], [resultMeasure(p.id, Array.from({ length: n }, (_, i) => i)), resultMeasure(q.id, Array.from({ length: n }, (_, i) => i))]);
    const ob = buildOption(ctx(makeSpec('scatter', { columns: [p], rows: [q] }), big));
    expect((ob.series as Series[])[0]!.large).toBe(true);
    expect((ob.series as Series[])[0]!.progressive).toBe(4000);
    expect(ob.animation).toBe(true);
    const huge = makeResult([], [resultMeasure(p.id, new Array(6000).fill(1)), resultMeasure(q.id, new Array(6000).fill(1))]);
    expect(buildOption(ctx(makeSpec('scatter', { columns: [p], rows: [q] }), huge)).animation).toBe(false);
  });

  it('bubble sizes by sqrt within sizeRange and counts negative sizes', () => {
    const { spec, result } = fixture('bubble');
    spec.marks.sizeRange = [6, 40];
    const o = buildOption(ctx(spec, result));
    const pts = (o.series as Series[])[0]!.data as Array<[number, number, number, string, number]>;
    expect(pts[2]![2]).toBeCloseTo(40);
    expect(pts[0]![2]).toBeCloseTo(6 + 34 * Math.sqrt(10 / 40));
    expect(pts[1]![2]).toBe(6);
    expect((o.__meta as { negativeSizes: number }).negativeSizes).toBe(1);
  });

  it('pie sorts by value, drops nulls; donut shows the total; > 12 slices fold into Other', () => {
    const o = buildOption(ctx(...Object.values(fixture('pie')) as [VizSpec, QueryResult]));
    const d = (o.series as Series[])[0]!.data as Array<{ name: string; value: number }>;
    expect(d.map((x) => x.name)).toEqual(['South', 'North']);
    const dn = buildOption(ctx(...Object.values(fixture('donut')) as [VizSpec, QueryResult]));
    expect((dn.graphic as Array<{ style: { text: string } }>)[0]!.style.text).toBe('75');
    expect((dn.series as Series[])[0]!.radius).toEqual(['55%', '80%']);
    const z = dim('zone'); const p = measure('p');
    const labels = Array.from({ length: 15 }, (_, i) => `z${i}`);
    const many = makeResult([resultDim(z.id, labels)], [resultMeasure(p.id, labels.map((_, i) => 15 - i))]);
    const om = buildOption(ctx(makeSpec('pie', { color: [z], size: [p] }), many));
    const dm = (om.series as Series[])[0]!.data as Array<{ name: string }>;
    expect(dm).toHaveLength(12);
    expect(dm[11]!.name).toBe('Other');
    expect((om.__meta as { folded: number }).folded).toBe(4);
  });

  it('gauge: domain [0, 1.1·max] rounded; the second measure is a target tick', () => {
    const o = buildOption(ctx(...Object.values(fixture('gauge')) as [VizSpec, QueryResult]));
    expect((o.__meta as { min: number; max: number; target: number }).max).toBe(100);
    expect((o.series as Series[])).toHaveLength(2);
    expect(((o.series as Series[])[0]!.data as Array<{ value: number }>)[0]!.value).toBe(72);
  });

  it('treemap nests color → leaf; sunburst needs 2 dims; dropped non-positive leaves counted', () => {
    const o = buildOption(ctx(...Object.values(fixture('sunburst')) as [VizSpec, QueryResult]));
    const roots = (o.series as Series[])[0]!.data as Array<{ name: string; value: number; children: unknown[] }>;
    expect(roots.map((r) => r.name)).toEqual(['North', 'South']);
    expect(roots[0]!.value).toBe(60);
    expect(roots[0]!.children).toHaveLength(3);
    const t = buildOption(ctx(...Object.values(fixture('treemap')) as [VizSpec, QueryResult]));
    expect(((t.series as Series[])[0]!.data as unknown[]).length).toBe(2);
    expect((t.__meta as { dropped: number }).dropped).toBe(1);
  });

  it('heatmap is a dense [xi, yi, v] grid with a visualMap spanning the data', () => {
    const o = buildOption(ctx(...Object.values(fixture('heatmap')) as [VizSpec, QueryResult]));
    const cells = (o.series as Series[])[0]!.data as number[][];
    expect(cells).toHaveLength(5);
    expect((o.visualMap as { min: number; max: number }).min).toBe(10);
    expect((o.visualMap as { min: number; max: number }).max).toBe(35);
    expect((o.xAxis as { data: string[] }).data).toEqual(['North', 'South']);
  });

  it('calendar-heatmap makes one calendar per year and keys cells yyyy-MM-dd', () => {
    const o = buildOption(ctx(...Object.values(fixture('calendar-heatmap')) as [VizSpec, QueryResult]));
    expect((o.calendar as unknown[]).length).toBe(2);
    expect((o.series as Series[])[0]!.data).toEqual([['2024-02-28', 1], ['2024-02-29', 2]]);
    expect((o.series as Series[])[1]!.data).toEqual([['2025-01-01', 3]]);
  });

  it('highlight-table colors cells and keeps text readable', () => {
    const m = buildOption(ctx(...Object.values(fixture('highlight-table')) as [VizSpec, QueryResult])) as unknown as HighlightModel;
    expect(m.kind).toBe('highlight');
    expect(m.rows.map((r) => r.label)).toEqual(['North', 'South', 'West']);
    expect(m.rows[0]!.cells[0]!.bg).not.toBeNull();
    expect(m.rows[2]!.cells[0]!.bg).toBeNull();
    expect(m.rows[2]!.cells[0]!.text).toBe('');
    expect(m.rows[1]!.cells[0]!.fg).toBe('#FFFFFF');
  });

  it('histogram keeps empty bins as zero-height bars with no gap', () => {
    const o = buildOption(ctx(...Object.values(fixture('histogram')) as [VizSpec, QueryResult]));
    const s = (o.series as Series[])[0]!;
    expect(s.data).toEqual([5, 0, 2]);
    expect(s.barCategoryGap).toBe('0%');
  });

  it('boxplot renders [lo, q1, med, q3, hi] per group plus outliers, and fails clearly without boxstats', () => {
    const { spec, result } = fixture('boxplot');
    const o = buildOption(ctx(spec, result));
    const [box, out] = o.series as Series[];
    expect(box!.data).toEqual([[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]);
    expect(out!.data).toEqual([[0, 9], [0, 10]]);
    delete result.boxstats;
    expect(tryBuildOption(ctx(spec, result))).toMatchObject({ ok: false, error: expect.stringMatching(/boxstats/) });
  });

  it('waterfall: transparent base + delta, trailing Total, fixed semantic colors', () => {
    const o = buildOption(ctx(...Object.values(fixture('waterfall')) as [VizSpec, QueryResult]));
    expect((o.xAxis as { data: string[] }).data).toEqual(['North', 'South', 'West', 'Total']);
    const [base, delta] = o.series as Series[];
    expect(base!.data).toEqual([0, 30, 75, 0]);
    const items = delta!.data as Array<{ value: number; itemStyle: { color: string } } | null>;
    expect(items[0]!.value).toBe(30);
    expect(items[2]).toBeNull();
    expect(items[3]!.value).toBe(75);
    expect(items[3]!.itemStyle.color).toBe('#1A2744');
    expect(items[0]!.itemStyle.color).toBe('#16A34A');
  });

  it('bullet: bands 60/80/100 % of the target, value bar, target tick', () => {
    const o = buildOption(ctx(...Object.values(fixture('bullet')) as [VizSpec, QueryResult]));
    const s = o.series as Series[];
    expect(s).toHaveLength(5);
    expect(s[0]!.data).toEqual([40, 40, 50]);
    expect(s[2]!.data).toEqual([24, 24, 30]);
    expect(s[4]!.data).toEqual([[40, 0], [40, 1], [50, 2]]);
  });

  it('lollipop: a 2px stem and a head per value', () => {
    const o = buildOption(ctx(...Object.values(fixture('lollipop')) as [VizSpec, QueryResult]));
    const [stem, head] = o.series as Series[];
    expect(stem!.barWidth).toBe(2);
    expect(head!.data).toEqual([[0, 30], [1, 45], null]);
  });

  it('dumbbell: a segment per row and two dot series in the pair colors; a null end is a single dot', () => {
    const o = buildOption(ctx(...Object.values(fixture('dumbbell')) as [VizSpec, QueryResult]));
    const [seg, a, b] = o.series as Series[];
    expect(seg!.type).toBe('custom');
    expect(a!.data).toEqual([[30, 0], [45, 1], null]);
    expect(b!.data).toEqual([[40, 0], [40, 1], [50, 2]]);
    expect((a!.itemStyle as { color: string }).color).toBe('#F59E0B');
    expect((b!.itemStyle as { color: string }).color).toBe('#6366F1');
  });

  it('radar: one polygon per dimension value, one indicator per measure', () => {
    const o = buildOption(ctx(...Object.values(fixture('radar')) as [VizSpec, QueryResult]));
    expect((o.radar as { indicator: unknown[] }).indicator).toHaveLength(3);
    const d = (o.series as Series[])[0]!.data as Array<{ name: string; value: Array<number | null> }>;
    expect(d.map((x) => x.name)).toEqual(['North', 'South']);
    expect(d[1]!.value).toEqual([2, 4, null]);
  });

  it('parallel: an axis per measure in shelf order, a line series per color value', () => {
    const o = buildOption(ctx(...Object.values(fixture('parallel')) as [VizSpec, QueryResult]));
    expect((o.parallelAxis as unknown[]).length).toBe(2);
    expect((o.series as Series[]).map((s) => s.name)).toEqual(['North', 'South']);
  });

  it('sankey: level-prefixed nodes and summed links', () => {
    const o = buildOption(ctx(...Object.values(fixture('sankey')) as [VizSpec, QueryResult]));
    const s = (o.series as Series[])[0]!;
    expect((s.data as Array<{ name: string }>).map((n) => n.name)).toEqual(['0:North', '1:Gas', '1:Wind', '1:Solar', '0:South']);
    expect((s.links as Array<{ value: number }>).map((l) => l.value)).toEqual([10, 20, 30, 15, 35]);
  });

  it('slope: two x positions, lines per color; wrong cardinality names the field', () => {
    const o = buildOption(ctx(...Object.values(fixture('slope')) as [VizSpec, QueryResult]));
    expect((o.xAxis as { data: string[] }).data).toEqual(['2023', '2024']);
    expect((o.series as Series[]).map((s) => s.name)).toEqual(['North', 'South']);
    const yr = dim('year'); const p = measure('p'); const z = dim('zone');
    const three = makeResult([resultDim(yr.id, ['a', 'b', 'c']), resultDim(z.id, ['x', 'x', 'x'])], [resultMeasure(p.id, [1, 2, 3])]);
    expect(tryBuildOption(ctx(makeSpec('slope', { columns: [yr], rows: [p], color: [z] }), three))).toMatchObject({ ok: false, error: 'year has 3 values; needs 2 — add a filter' });
  });

  it('bump: ranks on an inverted axis, gaps where a value is absent', () => {
    const o = buildOption(ctx(...Object.values(fixture('bump')) as [VizSpec, QueryResult]));
    expect((o.yAxis as { inverse: boolean }).inverse).toBe(true);
    const s = o.series as Series[];
    expect(s[0]!.name).toBe('North');
    expect((s[0]!.data as Array<[number, number | null]>).map((d) => d[1])).toEqual([2, 1, 2]);
    expect((s[1]!.data as Array<[number, number | null]>).map((d) => d[1])).toEqual([1, null, 1]);
  });

  it('candlestick: rows sorted by time, [t, o, c, l, h], invalid rows dropped and counted', () => {
    const o = buildOption(ctx(...Object.values(fixture('candlestick')) as [VizSpec, QueryResult]));
    const d = (o.series as Series[])[0]!.data as number[][];
    expect(d).toEqual([[day(2024, 1, 1), 11, 9, 8, 12], [day(2024, 1, 2), 10, 12, 9, 13]]);
    expect((o.__meta as { dropped: number }).dropped).toBe(0);
    expect((o.xAxis as { type: string }).type).toBe('time');
  });

  it('kpi and text-table DOM models', () => {
    const k = buildOption(ctx(...Object.values(fixture('kpi')) as [VizSpec, QueryResult])) as unknown as KpiModel;
    expect(k.kind).toBe('kpi');
    expect(k.value).toBe('1234.5');
    expect(k.delta).toEqual({ label: 'SUM(demand)', text: '-3', sign: 'negative' });
    const t = buildOption(ctx(...Object.values(fixture('text-table')) as [VizSpec, QueryResult])) as unknown as TableModel;
    expect(t.columns.map((c) => [c.label, c.align])).toEqual([['zone', 'left'], ['AVG(price)', 'right']]);
    expect(t.rows).toEqual([['North', '30'], ['South', '45'], ['West', '']]);
    expect(t.total).toBe(3);
  });

  it('mobile: tooltips trigger on click and animation is off', () => {
    const { spec, result } = fixture('bar');
    const o = buildOption(ctx(spec, result, true));
    expect((o.tooltip as { triggerOn: string }).triggerOn).toBe('click');
    expect(o.animation).toBe(false);
  });

  it('replaceMerge covers series and axes so removed parts never linger', () => {
    expect(REPLACE_MERGE_KEYS).toContain('series');
    expect(REPLACE_MERGE_KEYS).toContain('xAxis');
    expect(REPLACE_MERGE_KEYS).toContain('visualMap');
  });
});
