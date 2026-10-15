import { describe, expect, it } from 'vitest';
import { createDefaultSpec } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { createSpecStore } from '../../stores/spec.svelte';
import { applyDrop, defaultFilter, fieldPayload, payloadFromToken, pillPayload, selectionToken } from './drop-rules';

const META = [meta('zone', 'string'), meta('price', 'number'), meta('ts', 'datetime'), meta('flag', 'boolean')];

describe('drop rules', () => {
  it('a field on Columns becomes a pill with the field defaults', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const out = applyDrop(st, META, fieldPayload('zone'), 'columns');
    expect(out?.filterCreated).toBe(false);
    expect(st.value.shelves.columns).toHaveLength(1);
    expect(st.value.shelves.columns[0]).toMatchObject({ field: 'zone', role: 'dimension', continuity: 'discrete' });
  });

  it('a date on Columns defaults to the discrete YEAR part', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    applyDrop(st, META, fieldPayload('ts'), 'columns');
    expect(st.value.shelves.columns[0]).toMatchObject({ date: { level: 'year', mode: 'part' }, continuity: 'discrete' });
  });

  it('a measure on Filters becomes a range filter pill', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const out = applyDrop(st, META, fieldPayload('price'), 'filters');
    expect(out?.filterCreated).toBe(true);
    const pill = st.value.shelves.filters[0]!;
    expect(pill.field).toBe('price');
    expect(st.value.filters).toEqual([{ pillId: pill.id, field: 'price', kind: 'range', min: null, max: null, includeNull: false }]);
  });

  it('a date on Filters becomes a date-range filter; a string an include-all categorical', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    applyDrop(st, META, fieldPayload('ts'), 'filters');
    applyDrop(st, META, fieldPayload('zone'), 'filters');
    expect(st.value.filters.map((f) => f.kind)).toEqual(['dateRange', 'categorical']);
    expect(st.value.filters[0]).toMatchObject({ from: null, to: null, level: 'year' });
    expect(st.value.filters[1]).toMatchObject({ mode: 'exclude', values: [], includeNull: true });
  });

  it('one filter per field: a second drop of the same field replaces the first entry', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    applyDrop(st, META, fieldPayload('price'), 'filters');
    applyDrop(st, META, fieldPayload('price'), 'filters');
    expect(st.value.filters).toHaveLength(1);
    expect(st.value.filters[0]?.pillId).toBe(st.value.shelves.filters[1]?.id);
  });

  it('a pill dropped on another shelf moves as the same object', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const out = applyDrop(st, META, fieldPayload('price'), 'columns')!;
    applyDrop(st, META, pillPayload(out.pill, 'columns'), 'rows');
    expect(st.value.shelves.columns).toEqual([]);
    expect(st.value.shelves.rows[0]?.id).toBe(out.pill.id);
  });

  it('re-dropping within a shelf reorders by the visible index', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const a = applyDrop(st, META, fieldPayload('zone'), 'columns')!.pill;
    const b = applyDrop(st, META, fieldPayload('price'), 'columns')!.pill;
    const c = applyDrop(st, META, fieldPayload('ts'), 'columns')!.pill;
    // Drag a (index 0) to after c: the controller reports index 2 (a is not a slot).
    applyDrop(st, META, pillPayload(a, 'columns'), 'columns', 2);
    expect(st.value.shelves.columns.map((p) => p.id)).toEqual([b.id, c.id, a.id]);
    // Drag a (now index 2) to the front.
    applyDrop(st, META, pillPayload(a, 'columns'), 'columns', 0);
    expect(st.value.shelves.columns.map((p) => p.id)).toEqual([a.id, b.id, c.id]);
  });

  it('dropping a pill back on its own slot is a no-op (no undo step)', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const a = applyDrop(st, META, fieldPayload('zone'), 'columns')!.pill;
    applyDrop(st, META, fieldPayload('price'), 'columns');
    const before = st.value;
    applyDrop(st, META, pillPayload(a, 'columns'), 'columns', 0);
    expect(st.value).toBe(before);
  });

  it('moving a pill onto Filters creates its filter; moving it off removes it', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const p = applyDrop(st, META, fieldPayload('price'), 'rows')!.pill;
    const onto = applyDrop(st, META, pillPayload(p, 'rows'), 'filters');
    expect(onto?.filterCreated).toBe(true);
    expect(st.value.filters[0]?.kind).toBe('range');
    applyDrop(st, META, pillPayload(p, 'filters'), 'columns');
    expect(st.value.filters).toEqual([]);
  });

  it('single-pill shelves replace', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    applyDrop(st, META, fieldPayload('zone'), 'color');
    applyDrop(st, META, fieldPayload('flag'), 'color');
    expect(st.value.shelves.color.map((p) => p.field)).toEqual(['flag']);
  });

  it('an unknown field or a vanished pill drops nothing', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    expect(applyDrop(st, META, fieldPayload('nope'), 'columns')).toBeNull();
    expect(applyDrop(st, META, { kind: 'pill', field: 'zone', pillId: 'gone', fromShelf: 'rows' }, 'columns')).toBeNull();
    expect(st.canUndo).toBe(false);
  });

  it('defaultFilter follows the pill role when meta is missing', () => {
    const p = { id: 'x', field: 'f', role: 'measure', continuity: 'continuous', aggregation: 'sum' } as const;
    expect(defaultFilter(p, undefined).kind).toBe('range');
    expect(defaultFilter({ ...p, role: 'dimension' }, undefined).kind).toBe('categorical');
  });

  it('selection tokens round-trip through the store', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    expect(selectionToken(fieldPayload('zone'))).toBe('field:zone');
    expect(payloadFromToken('field:zone', st)).toEqual(fieldPayload('zone'));
    const p = applyDrop(st, META, fieldPayload('price'), 'rows')!.pill;
    expect(selectionToken(pillPayload(p, 'rows'))).toBe(p.id);
    expect(payloadFromToken(p.id, st)).toEqual(pillPayload(p, 'rows'));
    expect(payloadFromToken('missing', st)).toBeNull();
  });
});
