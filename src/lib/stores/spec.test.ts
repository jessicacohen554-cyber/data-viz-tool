import { describe, expect, it } from 'vitest';
import { createSpecStore } from './spec.svelte';
import { createDefaultSpec, newPill } from '../core/spec-defaults';
import { meta } from '../core/spec-defaults.test';

describe('spec store', () => {
  it('patch records undo history; undo/redo restore values', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    st.patch((d) => { d.chartType = 'bar'; });
    st.patch((d) => { d.chartType = 'line'; });
    expect(st.value.chartType).toBe('line');
    st.undo();
    expect(st.value.chartType).toBe('bar');
    st.undo();
    expect(st.value.chartType).toBe('text-table');
    expect(st.canUndo).toBe(false);
    st.redo();
    expect(st.value.chartType).toBe('bar');
  });

  it('add/move/remove pills respect single-pill shelves and clean filters', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const a = newPill(meta('zone', 'string'), 'columns');
    const b = newPill(meta('fuel', 'string'), 'columns');
    st.addPill('columns', a);
    st.addPill('columns', b, 0);
    expect(st.value.shelves.columns.map((p) => p.field)).toEqual(['fuel', 'zone']);
    st.movePill(a.id, 'color');
    st.movePill(b.id, 'color');
    expect(st.value.shelves.color.map((p) => p.field)).toEqual(['fuel']);
    expect(st.value.shelves.columns).toEqual([]);
    const f = newPill(meta('zone', 'string'), 'filters');
    st.addPill('filters', f);
    st.patch((d) => { d.filters.push({ pillId: f.id, field: 'zone', kind: 'wildcard', pattern: 'W', mode: 'starts' }); });
    st.removePill(f.id);
    expect(st.value.filters).toEqual([]);
    expect(st.findPill(f.id)).toBeNull();
  });

  it('updatePill mutates in place through history', () => {
    const st = createSpecStore(createDefaultSpec('d'));
    const p = newPill(meta('price', 'number'), 'rows');
    st.addPill('rows', p);
    st.updatePill(p.id, (pp) => { pp.aggregation = 'avg'; });
    expect(st.findPill(p.id)?.pill.aggregation).toBe('avg');
    st.undo();
    expect(st.findPill(p.id)?.pill.aggregation).toBe('sum');
  });
});
