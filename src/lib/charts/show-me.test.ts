import { describe, expect, it } from 'vitest';
import type { ChartTypeId } from '../core/types';
import { CHART_TYPE_IDS } from '../core/constants';
import { arrangeFor, eligibility, suggest } from './show-me';
import { date, dim, fieldMeta, makeSpec, measure } from './test-fixtures';

const ok = (ids: ChartTypeId[], spec: ReturnType<typeof makeSpec>, meta = [] as ReturnType<typeof fieldMeta>[]) =>
  eligibility(spec, meta).filter((e) => e.ok).map((e) => e.id).sort();

describe('eligibility matrix', () => {
  it('empty worksheet: only text-table', () => {
    expect(ok([], makeSpec('text-table', {}))).toEqual(['text-table']);
  });

  it('one measure, no dimension: boxplot (single box), gauge, kpi, text-table', () => {
    expect(ok([], makeSpec('kpi', { rows: [measure('p')] }))).toEqual(['boxplot', 'gauge', 'kpi', 'text-table']);
  });

  it('two measures, no dimension: scatter and parallel join', () => {
    const ids = ok([], makeSpec('scatter', { columns: [measure('a')], rows: [measure('b')] }));
    expect(ids).toContain('scatter');
    expect(ids).toContain('parallel');
    expect(ids).not.toContain('bubble');
    expect(ids).not.toContain('bar');
  });

  it('1 D + 1 M: the single-series family', () => {
    const ids = ok([], makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] }));
    for (const id of ['bar', 'bar-h', 'line', 'area', 'pie', 'donut', 'funnel', 'treemap', 'highlight-table', 'waterfall', 'bullet', 'lollipop', 'boxplot', 'text-table']) expect(ids).toContain(id);
    for (const id of ['bar-grouped', 'bar-stacked', 'heatmap', 'sunburst', 'sankey', 'dumbbell', 'radar', 'slope', 'bump', 'candlestick', 'kpi', 'gauge']) expect(ids).not.toContain(id);
  });

  it('1 D + 1 M + color D unlocks grouped/stacked bars and gives reasons otherwise', () => {
    const spec = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')], color: [dim('fuel')] });
    const ids = ok([], spec);
    for (const id of ['bar-grouped', 'bar-stacked', 'bar-stacked-100', 'heatmap', 'sunburst', 'sankey']) expect(ids).toContain(id);
    const reasons = Object.fromEntries(eligibility(makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] }), []).map((e) => [e.id, e.reason]));
    expect(reasons['bar-grouped']).toMatch(/dimension/);
    expect(reasons['radar']).toMatch(/3 measures/);
    expect(reasons['candlestick']).toMatch(/4 measures|date/);
  });

  it('date-specific types need a trunc date (streamgraph) or a day-level trunc date (calendar)', () => {
    const part = makeSpec('line', { columns: [date('ts', 'month', 'part')], rows: [measure('p')], color: [dim('zone')] });
    const trunc = makeSpec('line', { columns: [date('ts', 'month', 'trunc')], rows: [measure('p')], color: [dim('zone')] });
    const dayTrunc = makeSpec('line', { columns: [date('ts', 'day', 'trunc')], color: [measure('p')] });
    expect(ok([], part)).not.toContain('streamgraph');
    expect(ok([], trunc)).toContain('streamgraph');
    expect(ok([], trunc)).toContain('bump');
    expect(ok([], trunc)).not.toContain('calendar-heatmap');
    expect(ok([], dayTrunc)).toContain('calendar-heatmap');
  });

  it('slope names the offending dimension and its cardinality', () => {
    const spec = makeSpec('slope', { columns: [dim('year')], rows: [measure('p')], color: [dim('zone')] });
    const e = eligibility(spec, [fieldMeta('year', 'string', 7)]).find((x) => x.id === 'slope')!;
    expect(e.ok).toBe(false);
    expect(e.reason).toBe('year has 7 values; needs 2 — add a filter');
    expect(eligibility(spec, [fieldMeta('year', 'string', 2)]).find((x) => x.id === 'slope')!.ok).toBe(true);
  });

  it('candlestick wants exactly 4 measures on Rows and a date', () => {
    const spec = makeSpec('candlestick', { columns: [date('ts', 'day')], rows: [measure('o'), measure('c'), measure('l'), measure('h')] });
    expect(ok([], spec)).toContain('candlestick');
    expect(eligibility(makeSpec('candlestick', { columns: [date('ts', 'day')], rows: [measure('o'), measure('c')] }), []).find((x) => x.id === 'candlestick')!.reason).toMatch(/4 measures/);
  });

  it('every id is covered by the matrix', () => {
    expect(eligibility(makeSpec('bar', {}), []).map((e) => e.id)).toEqual([...CHART_TYPE_IDS]);
  });
});

describe('suggest', () => {
  it('bar → line → scatter → text-table', () => {
    expect(suggest(makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] }), [])).toBe('bar');
    expect(suggest(makeSpec('bar', { columns: [date('ts', 'month', 'part')], rows: [measure('p')] }), [])).toBe('bar');
    expect(suggest(makeSpec('bar', { columns: [date('ts', 'month', 'trunc')], rows: [measure('p')] }), [])).toBe('bar');
    expect(suggest(makeSpec('bar', { columns: [measure('a')], rows: [measure('b')] }), [])).toBe('scatter');
    expect(suggest(makeSpec('bar', { rows: [measure('p')] }), [])).toBe('text-table');
    expect(suggest(makeSpec('bar', {}), [])).toBe('text-table');
  });
});

describe('arrangeFor (Show Me move)', () => {
  it('bar: D₁ → Columns, M₁ → Rows, D₂ → Color, the rest → Detail', () => {
    const [z, f, s] = [dim('zone'), dim('fuel'), dim('state')];
    const spec = makeSpec('text-table', { rows: [z, f, s], label: [measure('p')] });
    arrangeFor(spec, 'bar');
    expect(spec.chartType).toBe('bar');
    expect(spec.shelves.columns.map((p) => p.id)).toEqual([z.id]);
    expect(spec.shelves.rows.map((p) => p.field)).toEqual(['p']);
    expect(spec.shelves.color.map((p) => p.id)).toEqual([f.id]);
    expect(spec.shelves.detail.map((p) => p.id)).toEqual([s.id]);
  });

  it('line prefers the date pill on Columns; heatmap puts the measure on Color', () => {
    const t = date('ts', 'month', 'part');
    const spec = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')], detail: [t] });
    arrangeFor(spec, 'line');
    expect(spec.shelves.columns[0]!.id).toBe(t.id);
    expect(spec.shelves.color[0]!.field).toBe('zone');
    arrangeFor(spec, 'heatmap');
    expect(spec.shelves.color[0]!.field).toBe('p');
    expect(spec.shelves.columns).toHaveLength(1);
    expect(spec.shelves.rows).toHaveLength(1);
  });

  it('histogram bins the measure and adds a count measure; boxplot disaggregates', () => {
    const spec = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] });
    arrangeFor(spec, 'histogram');
    expect(spec.shelves.columns[0]!.bin).toEqual({ count: 20 });
    expect(spec.shelves.rows[0]!.aggregation).toBe('count');
    const spec2 = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] });
    arrangeFor(spec2, 'boxplot');
    expect(spec2.shelves.rows[0]!.aggregation).toBe('none');
  });

  it('never loses a pill and keeps the filters shelf', () => {
    const f = dim('year');
    const spec = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p'), measure('q')], color: [dim('fuel')], filters: [f] });
    for (const target of CHART_TYPE_IDS) {
      const s = JSON.parse(JSON.stringify(spec)) as typeof spec;
      arrangeFor(s, target);
      const ids = (['columns', 'rows', 'color', 'size', 'label', 'detail', 'tooltip', 'shape'] as const).flatMap((k) => s.shelves[k].map((p) => p.id));
      // histogram adds a count pill; everything else is a permutation.
      const expected = target === 'histogram' ? 5 : 4;
      expect(new Set(ids).size, target).toBe(expected);
      expect(s.shelves.filters.map((p) => p.id)).toEqual([f.id]);
      expect(s.chartType).toBe(target);
    }
  });
});
