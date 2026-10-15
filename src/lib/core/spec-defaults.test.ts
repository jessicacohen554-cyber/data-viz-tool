import { describe, expect, it } from 'vitest';
import { createDefaultSpec, newPill, defaultRole, defaultContinuity, defaultAggregation, newId } from './spec-defaults';
import { validateSpec } from './validate-spec';
import { ALL_SHELVES } from './constants';
import type { FieldMeta } from './types';

export function meta(name: string, type: FieldMeta['type']): FieldMeta {
  const role = defaultRole(type);
  return {
    name, index: 0, type, role,
    defaultContinuity: defaultContinuity(role), defaultAggregation: defaultAggregation(role),
    storage: type === 'string' ? 'dict' : type === 'boolean' ? 'bool' : type === 'integer' ? 'i32' : type === 'number' ? 'f64' : 'date',
    rowCount: 10, nullCount: 0, cardinality: 3, highCardinality: false, min: null, max: null,
    topValues: [], dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 1,
  };
}

describe('spec defaults', () => {
  it('creates a valid empty spec with every shelf present', () => {
    const s = createDefaultSpec('ds');
    expect(validateSpec(s)).toEqual([]);
    for (const shelf of ALL_SHELVES) expect(s.shelves[shelf]).toEqual([]);
    expect(s.chartType).toBe('text-table');
  });

  it('numbers are measures (SUM, continuous); strings are dimensions (COUNT, discrete)', () => {
    expect(defaultRole('number')).toBe('measure');
    expect(defaultRole('integer')).toBe('measure');
    expect(defaultRole('string')).toBe('dimension');
    expect(defaultAggregation('measure')).toBe('sum');
    expect(defaultAggregation('dimension')).toBe('count');
    expect(defaultContinuity('measure')).toBe('continuous');
    expect(defaultContinuity('dimension')).toBe('discrete');
  });

  it('date pills default to discrete YEAR part', () => {
    const p = newPill(meta('ts', 'datetime'), 'columns');
    expect(p.date).toEqual({ level: 'year', mode: 'part' });
    expect(p.continuity).toBe('discrete');
  });

  it('ids are unique UUID-shaped strings', () => {
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
