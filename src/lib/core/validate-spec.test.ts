import { describe, expect, it } from 'vitest';
import { createDefaultSpec, newPill } from './spec-defaults';
import { validateSpec } from './validate-spec';
import { meta } from './spec-defaults.test';

describe('validateSpec', () => {
  it('rejects non-objects and wrong versions', () => {
    expect(validateSpec(null)).toEqual(['spec is not an object']);
    expect(validateSpec({ ...createDefaultSpec('d'), version: 2 })[0]).toMatch(/version/);
  });

  it('enforces single-pill shelves', () => {
    const s = createDefaultSpec('d');
    const m = meta('zone', 'string');
    s.shelves.color = [newPill(m, 'color'), newPill(m, 'color')];
    expect(validateSpec(s)).toContain('shelves.color: holds at most one pill');
  });

  it('checks fields against meta when provided', () => {
    const s = createDefaultSpec('d');
    s.shelves.columns = [newPill(meta('zone', 'string'), 'columns')];
    expect(validateSpec(s, [meta('zone', 'string')])).toEqual([]);
    expect(validateSpec(s, [meta('other', 'string')])[0]).toMatch(/unknown field "zone"/);
  });

  it('filters must reference a pill on the filters shelf', () => {
    const s = createDefaultSpec('d');
    const p = newPill(meta('zone', 'string'), 'filters');
    s.shelves.filters = [p];
    s.filters = [{ pillId: p.id, field: 'zone', kind: 'categorical', mode: 'include', values: ['West'], includeNull: false }];
    expect(validateSpec(s)).toEqual([]);
    s.filters[0]!.pillId = 'nope';
    expect(validateSpec(s)[0]).toMatch(/pillId/);
  });

  it('rejects unknown chart types and bad aggregations', () => {
    const s = createDefaultSpec('d') as unknown as Record<string, unknown>;
    s.chartType = 'pie3d';
    expect(validateSpec(s)[0]).toMatch(/chartType/);
    const t = createDefaultSpec('d');
    const p = newPill(meta('price', 'number'), 'rows');
    (p as unknown as { aggregation: string }).aggregation = 'mode';
    t.shelves.rows = [p];
    expect(validateSpec(t)[0]).toMatch(/bad aggregation/);
  });
});
