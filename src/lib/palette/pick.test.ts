/**
 * The `pickPalette` matrix (docs/PALETTES.md §4 and the S2 acceptance list).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldMeta, PaletteSelection, Pill, QueryResult } from '../core/types';
import { OVERFLOW_COLOR } from './categorical';
import { DEFAULT_SINGLE_COLOR, pickPalette, resetColorMemo } from './pick';
import { getPalette } from './registry';

function meta(partial: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: 'fuel', index: 2, type: 'string', role: 'dimension', defaultContinuity: 'discrete', defaultAggregation: 'count',
    storage: 'dict', rowCount: 100, nullCount: 0, cardinality: 4, highCardinality: false, min: null, max: null,
    topValues: [], dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 1, ...partial,
  };
}

function pill(partial: Partial<Pill> = {}): Pill {
  return { id: 'p1', field: 'fuel', role: 'dimension', continuity: 'discrete', aggregation: 'count', ...partial };
}

function codesResult(labels: string[], codes?: number[]): QueryResult {
  const c = codes ?? labels.map((_, i) => i);
  return {
    key: 'k', groups: c.length,
    dims: [{ key: 'p1', kind: 'codes', codes: Int32Array.from(c), labels }],
    measures: [{ key: 'm1', values: Float64Array.from(c.map((x) => x * 10)) }],
    scannedRows: 100, filteredRows: 100, truncated: false, elapsedMs: 1,
  };
}

function valuesResult(values: number[]): QueryResult {
  return {
    key: 'k', groups: values.length,
    dims: [{ key: 'd1', kind: 'codes', codes: Int32Array.from(values.map((_, i) => i)), labels: values.map(String) }],
    measures: [{ key: 'p1', values: Float64Array.from(values) }],
    scannedRows: 100, filteredRows: 100, truncated: false, elapsedMs: 1,
  };
}

const AUTO: PaletteSelection = { mode: 'auto' };

beforeEach(() => resetColorMemo());

describe('no pill', () => {
  it('single Observatory sky color', () => {
    expect(pickPalette(undefined, undefined, AUTO, null, 'bar')).toEqual({ kind: 'none', color: DEFAULT_SINGLE_COLOR });
    expect(pickPalette(undefined, undefined, AUTO, null, 'dumbbell')).toEqual({ kind: 'none', color: '#0EA5E9' });
  });
});

describe('discrete pill → categorical', () => {
  it('observatory by default, fixed order over the sorted domain when nothing matches', () => {
    const enc = pickPalette(pill(), meta(), AUTO, codesResult(['WEST', 'HOUSTON', 'NORTH']), 'bar');
    expect(enc.kind).toBe('categorical');
    if (enc.kind !== 'categorical') return;
    expect(enc.paletteId).toBe('observatory');
    expect(enc.domain).toEqual(['WEST', 'HOUSTON', 'NORTH']);
    expect(enc.map).toEqual({ HOUSTON: '#F59E0B', NORTH: '#22C55E', WEST: '#0EA5E9' });
  });
  it('name matching engages at ≥ 50 % matches (ERCOT fuel_group)', () => {
    const enc = pickPalette(pill(), meta(), AUTO, codesResult(['Gas', 'Coal', 'wind', 'solar', 'OTHER']), 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    expect(enc.map).toEqual({ Gas: '#6B7280', Coal: '#374151', wind: '#22C55E', solar: '#F59E0B', OTHER: '#6B7280' });
  });
  it('switches to observatory-iso when ≥ 50 % of values are ISO tokens', () => {
    const enc = pickPalette(pill(), meta(), AUTO, codesResult(['ERCOT', 'PJM', 'Elsewhere']), 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    expect(enc.paletteId).toBe('observatory-iso');
    expect(enc.map['ERCOT']).toBe('#22C55E');
    expect(enc.map['PJM']).toBe('#0EA5E9');
    expect(enc.map['Elsewhere']).toBe('#F59E0B');
  });
  it('same label keeps its color when the domain shrinks, and new labels take unused hues', () => {
    const full = pickPalette(pill(), meta(), AUTO, codesResult(['A', 'B', 'C', 'D']), 'bar');
    const shrunk = pickPalette(pill(), meta(), AUTO, codesResult(['C', 'D']), 'bar');
    if (full.kind !== 'categorical' || shrunk.kind !== 'categorical') throw new Error('kind');
    expect(shrunk.domain).toEqual(['C', 'D']);
    expect(shrunk.map['C']).toBe(full.map['C']);
    expect(shrunk.map['D']).toBe(full.map['D']);
    const grown = pickPalette(pill(), meta(), AUTO, codesResult(['E', 'A']), 'bar');
    if (grown.kind !== 'categorical') throw new Error('kind');
    expect(grown.map['A']).toBe(full.map['A']);
    expect(grown.map['E']).toBe('#6B7280'); // the 5th Observatory hue, never a recycled one
  });
  it('only codes present in the result form the domain', () => {
    const enc = pickPalette(pill(), meta(), AUTO, codesResult(['A', 'B', 'C'], [2, 0]), 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    expect(enc.domain).toEqual(['C', 'A']);
  });
  it('overrides win', () => {
    const sel: PaletteSelection = { mode: 'auto', overrides: { wind: '#123456' } };
    const enc = pickPalette(pill(), meta(), sel, codesResult(['wind', 'solar']), 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    expect(enc.map['wind']).toBe('#123456');
    expect(enc.map['solar']).toBe('#F59E0B');
  });
  it('manual mode honours the categorical id and skips name matching', () => {
    const sel: PaletteSelection = { mode: 'manual', categorical: 'okabe-ito' };
    const enc = pickPalette(pill(), meta(), sel, codesResult(['wind', 'solar']), 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    expect(enc.paletteId).toBe('okabe-ito');
    expect(enc.map).toEqual({ solar: '#E69F00', wind: '#56B4E9' });
  });
  it('an unknown or wrong-kind id falls back to the default', () => {
    const a = pickPalette(pill(), meta(), { mode: 'manual', categorical: 'nope' }, codesResult(['x']), 'bar');
    const b = pickPalette(pill(), meta(), { mode: 'manual', categorical: 'seq-sky' }, codesResult(['x']), 'bar');
    expect(a.kind === 'categorical' && a.paletteId).toBe('observatory');
    expect(b.kind === 'categorical' && b.paletteId).toBe('observatory');
  });
  it('dumbbell and slope default to the amber/indigo pair', () => {
    for (const chart of ['dumbbell', 'slope'] as const) {
      const enc = pickPalette(pill(), meta(), AUTO, codesResult(['2023', '2024']), chart);
      if (enc.kind !== 'categorical') throw new Error('kind');
      expect(enc.paletteId).toBe('pairs-amber-indigo');
      expect(enc.map).toEqual({ '2023': '#F59E0B', '2024': '#6366F1' });
    }
  });
  it('categories beyond the set take the overflow color, never a recycled hue', () => {
    const labels = Array.from({ length: 14 }, (_, i) => `c${String(i).padStart(2, '0')}`);
    const enc = pickPalette(pill(), meta(), AUTO, codesResult(labels), 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    const used = Object.values(enc.map);
    expect(used.filter((c) => c === OVERFLOW_COLOR)).toHaveLength(2);
    expect(new Set(used.filter((c) => c !== OVERFLOW_COLOR)).size).toBe(12);
  });
  it('without a result the domain comes from topValues', () => {
    const enc = pickPalette(pill(), meta({ topValues: [['wind', 50], ['solar', 30]] }), AUTO, null, 'bar');
    if (enc.kind !== 'categorical') throw new Error('kind');
    expect(enc.domain).toEqual(['wind', 'solar']);
  });
});

describe('continuous pill → sequential / diverging', () => {
  const cPill = pill({ role: 'measure', continuity: 'continuous', aggregation: 'avg' });
  const cMeta = meta({ name: 'price', type: 'number', role: 'measure', storage: 'f64', min: 0, max: 100 });

  it('sequential seq-sky over [min, max] of the result', () => {
    const enc = pickPalette(cPill, cMeta, AUTO, valuesResult([5, 20, NaN, 80]), 'heatmap');
    expect(enc).toEqual({ kind: 'continuous', paletteId: 'seq-sky', domain: [5, 80], stops: getPalette('seq-sky')!.colors });
  });
  it('falls back to the field min/max without a result', () => {
    const enc = pickPalette(cPill, cMeta, AUTO, null, 'heatmap');
    expect(enc.kind === 'continuous' && enc.domain).toEqual([0, 100]);
  });
  it('spans zero → diverging div-cool-warm with midpoint zero', () => {
    const enc = pickPalette(cPill, cMeta, AUTO, valuesResult([-10, 5, 30]), 'heatmap');
    expect(enc).toEqual({ kind: 'continuous', paletteId: 'div-cool-warm', domain: [-10, 30], midpoint: 0, stops: getPalette('div-cool-warm')!.colors });
  });
  it('useDiverging forces diverging; midpoint mean / median / custom', () => {
    const r = valuesResult([10, 20, 60]);
    const mean = pickPalette(cPill, cMeta, { mode: 'auto', useDiverging: true, midpoint: 'mean' }, r, 'heatmap');
    const median = pickPalette(cPill, cMeta, { mode: 'auto', useDiverging: true, midpoint: 'median' }, r, 'heatmap');
    const custom = pickPalette(cPill, cMeta, { mode: 'auto', useDiverging: true, midpoint: 25 }, r, 'heatmap');
    expect(mean.kind === 'continuous' && mean.midpoint).toBe(30);
    expect(median.kind === 'continuous' && median.midpoint).toBe(20);
    expect(custom.kind === 'continuous' && custom.midpoint).toBe(25);
    expect(mean.kind === 'continuous' && mean.paletteId).toBe('div-cool-warm');
  });
  it('useDiverging false keeps sequential even across zero', () => {
    const enc = pickPalette(cPill, cMeta, { mode: 'auto', useDiverging: false }, valuesResult([-1, 1]), 'heatmap');
    expect(enc.kind === 'continuous' && enc.paletteId).toBe('seq-sky');
  });
  it('manual ids and an explicit domain', () => {
    const sel: PaletteSelection = { mode: 'manual', sequential: 'viridis', diverging: 'div-teal-brown', domain: [0, 50] };
    const seq = pickPalette(cPill, cMeta, sel, valuesResult([-5, 5]), 'heatmap');
    expect(seq.kind === 'continuous' && seq.paletteId).toBe('viridis'); // manual: no auto zero-span switch
    expect(seq.kind === 'continuous' && seq.domain).toEqual([0, 50]);
    const div = pickPalette(cPill, cMeta, { ...sel, useDiverging: true }, valuesResult([-5, 5]), 'heatmap');
    expect(div.kind === 'continuous' && div.paletteId).toBe('div-teal-brown');
  });
  it('reverse flips the stops', () => {
    const enc = pickPalette(cPill, cMeta, { mode: 'auto', reverse: true }, valuesResult([1, 2]), 'heatmap');
    expect(enc.kind === 'continuous' && enc.stops).toEqual([...getPalette('seq-sky')!.colors].reverse());
  });
  it('a continuous dim (date trunc) supplies the domain', () => {
    const result: QueryResult = {
      key: 'k', groups: 2, dims: [{ key: 'p1', kind: 'values', values: Float64Array.from([100, 300]) }],
      measures: [], scannedRows: 1, filteredRows: 1, truncated: false, elapsedMs: 0,
    };
    const enc = pickPalette(pill({ continuity: 'continuous', date: { level: 'month', mode: 'trunc' } }), cMeta, AUTO, result, 'line');
    expect(enc.kind === 'continuous' && enc.domain).toEqual([100, 300]);
  });
});
