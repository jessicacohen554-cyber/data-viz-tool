// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReferenceLine } from '../../core/types';
import { REFERENCE_LINE_KINDS } from '../../core/constants';
import { createDefaultSpec, newPill } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { spec } from '../../stores/spec.svelte';
import ReferenceLineDialog, { DEFAULT_PERCENTILE, KINDS, describeReferenceLine, newReferenceLine, setKind } from './ReferenceLineDialog.svelte';
import { byLabel, click, mountComponent, setChecked, setValue, type Mounted } from './mount.test';

describe('ReferenceLineDialog helpers', () => {
  it('a new line is an average on y, dashed, whole chart, with a unique id', () => {
    const a = newReferenceLine();
    const b = newReferenceLine();
    expect(a).toMatchObject({ axis: 'y', kind: 'average', dash: true, scope: 'all' });
    expect(a.id).not.toBe(b.id);
    expect(KINDS).toEqual(REFERENCE_LINE_KINDS);
  });

  it('setKind seeds the fields the kind needs and drops the rest', () => {
    const l = newReferenceLine();
    setKind(l, 'constant');
    expect(l.value).toBe(0);
    l.value = 42;
    setKind(l, 'band');
    expect(l).toMatchObject({ kind: 'band', from: 'min', to: 'max' });
    expect('value' in l).toBe(false);
    setKind(l, 'percentile');
    expect(l.value).toBe(DEFAULT_PERCENTILE);
    expect('from' in l).toBe(false);
    setKind(l, 'median');
    expect('value' in l).toBe(false);
  });

  it('describes a line for the list', () => {
    const l = newReferenceLine();
    expect(describeReferenceLine(l)).toBe('y · Average');
    expect(describeReferenceLine({ ...l, axis: 'x', kind: 'constant', value: 7 })).toBe('x · Constant 7');
    expect(describeReferenceLine({ ...l, kind: 'percentile', value: 95 })).toBe('y · P95');
    expect(describeReferenceLine({ ...l, axis: 'y2', kind: 'band', from: 'p25', to: 12 })).toBe('y2 · Band p25 → 12');
  });
});

describe('ReferenceLineDialog component', () => {
  let m: Mounted | null = null;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    m = mountComponent(ReferenceLineDialog, { open: true, onclose: () => {} });
    return () => { m?.unmount(); m = null; };
  });

  const lines = (): ReferenceLine[] => spec.value.referenceLines;
  const addButton = () => Array.from(m!.root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add line');

  it('starts empty, adds a line and selects it for editing', () => {
    expect(m!.root.textContent).toContain('No reference lines yet');
    click(addButton());
    expect(lines().length).toBe(1);
    const row = m!.root.querySelector<HTMLElement>('[data-line]')!;
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.textContent).toContain('y · Average');
    expect(byLabel(m!.root, 'Kind')).not.toBeUndefined();
  });

  it('edits axis, kind, value, label, color, dash and scope on the selected line', () => {
    click(addButton());
    setValue(byLabel(m!.root, 'Kind'), 'constant');
    expect(lines()[0]!.kind).toBe('constant');
    setValue(byLabel(m!.root, 'Value'), '60');
    expect(lines()[0]!.value).toBe(60);
    setValue(byLabel(m!.root, 'Axis'), 'x');
    expect(lines()[0]!.axis).toBe('x');
    setValue(byLabel(m!.root, 'Label'), ' Cap ');
    expect(lines()[0]!.label).toBe('Cap');
    expect(m!.root.querySelector('[data-line]')!.textContent).toContain('Cap');
    setValue(byLabel(m!.root, 'Color'), '#ff0000');
    expect(lines()[0]!.color).toBe('#ff0000');
    click(Array.from(m!.root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Auto'));
    expect('color' in lines()[0]!).toBe(false);
    setChecked(byLabel(m!.root, 'Dashed'), false);
    expect(lines()[0]!.dash).toBe(false);
    click(m!.root.querySelector('[data-scope="per-series"]'));
    expect(lines()[0]!.scope).toBe('per-series');
    setValue(byLabel(m!.root, 'Label'), '');
    expect('label' in lines()[0]!).toBe(false);
  });

  it('percentile clamps to 0–100; band edges take statistics or constants', () => {
    click(addButton());
    setValue(byLabel(m!.root, 'Kind'), 'percentile');
    expect(lines()[0]!.value).toBe(DEFAULT_PERCENTILE);
    setValue(byLabel(m!.root, 'Percentile'), '250');
    expect(lines()[0]!.value).toBe(100);
    setValue(byLabel(m!.root, 'Kind'), 'band');
    expect(lines()[0]).toMatchObject({ kind: 'band', from: 'min', to: 'max' });
    setValue(byLabel(m!.root, 'Band from'), 'p25');
    setValue(byLabel(m!.root, 'Band to'), 'custom');
    expect(lines()[0]).toMatchObject({ from: 'p25', to: 0 });
    setValue(byLabel(m!.root, 'Band to value'), '80');
    expect(lines()[0]!.to).toBe(80);
    expect(m!.root.querySelector('[data-line]')!.textContent).toContain('Band p25 → 80');
  });

  it('secondary axis is offered only when a pill sits on it', () => {
    click(addButton());
    const y2 = m!.root.querySelector<HTMLOptionElement>('option[value="y2"]')!;
    expect(y2.disabled).toBe(true);
    const p = newPill(meta('price', 'number'), 'rows');
    p.axis = 'secondary';
    spec.patch((d) => { d.shelves.rows = [p]; });
    m!.unmount();
    m = mountComponent(ReferenceLineDialog, { open: true, onclose: () => {} });
    expect(m!.root.querySelector<HTMLOptionElement>('option[value="y2"]')!.disabled).toBe(false);
  });

  it('removes a line, keeping the others, and each write is one undo step', () => {
    click(addButton());
    click(addButton());
    expect(lines().length).toBe(2);
    const first = lines()[0]!.id;
    click(m!.root.querySelector('.list__remove'));
    expect(lines().length).toBe(1);
    expect(lines()[0]!.id).not.toBe(first);
    spec.undo();
    expect(lines().length).toBe(2);
  });
});
