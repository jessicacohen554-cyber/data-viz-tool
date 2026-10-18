// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultSpec, defaultAxis, newPill } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { spec } from '../../stores/spec.svelte';
import AxisDialog, { AXIS_LABEL, axisPreviewMeta, defaultMarkByAxis, hasSecondaryAxis, isFixed, titleMode } from './AxisDialog.svelte';
import { byLabel, click, mountComponent, setChecked, setValue, type Mounted } from './mount.test';

describe('AxisDialog helpers', () => {
  it('title mode and fixed bounds read the AxisSpec encoding', () => {
    expect(titleMode({ ...defaultAxis() })).toBe('auto');
    expect(titleMode({ ...defaultAxis(), title: 'MW' })).toBe('custom');
    expect(titleMode({ ...defaultAxis(), title: null })).toBe('none');
    expect(isFixed(3)).toBe(true);
    expect(isFixed('auto')).toBe(false);
    expect(isFixed(undefined)).toBe(false);
    expect(isFixed(Number.NaN)).toBe(false);
  });

  it('detects a secondary axis pill on either value shelf', () => {
    const s = createDefaultSpec('d');
    expect(hasSecondaryAxis(s)).toBe(false);
    const p = newPill(meta('price', 'number'), 'columns');
    p.axis = 'secondary';
    s.shelves.columns = [p];
    expect(hasSecondaryAxis(s)).toBe(true);
    expect(defaultMarkByAxis()).toEqual({ primary: 'bar', secondary: 'line' });
    expect(axisPreviewMeta().type).toBe('number');
    expect(AXIS_LABEL.y2).toBe('Secondary Y axis');
  });
});

describe('AxisDialog component', () => {
  let m: Mounted | null = null;

  function mountAxis(which: 'x' | 'y' | 'y2'): Mounted {
    m = mountComponent(AxisDialog, { open: true, onclose: () => {}, which });
    return m;
  }

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    return () => { m?.unmount(); m = null; };
  });

  it('shows the axis heading and a message when no axis is selected', () => {
    mountAxis('y2');
    expect(m!.root.querySelector('.dialog__title')!.textContent).toBe('Secondary Y axis');
    m!.unmount();
    m = mountComponent(AxisDialog, { open: true, onclose: () => {}, which: null });
    expect(m!.root.textContent).toContain('No axis selected');
  });

  it('title: automatic / custom text / none round-trip to axes.y.title', () => {
    mountAxis('y');
    click(m!.root.querySelector('[data-title-mode="custom"]'));
    expect(spec.value.axes.y.title).toBe('');
    setValue(byLabel(m!.root, 'Axis title text'), 'Price ($/MWh)');
    expect(spec.value.axes.y.title).toBe('Price ($/MWh)');
    click(m!.root.querySelector('[data-title-mode="none"]'));
    expect(spec.value.axes.y.title).toBeNull();
    expect(byLabel(m!.root, 'Axis title text')).toBeUndefined();
    click(m!.root.querySelector('[data-title-mode="auto"]'));
    expect('title' in spec.value.axes.y).toBe(false);
  });

  it('range: fixed seeds min 0 / max auto; bounds write numbers, empty means auto; automatic clears both', () => {
    mountAxis('x');
    expect(byLabel(m!.root, 'Axis minimum')).toBeUndefined();
    click(m!.root.querySelector('[data-range="fixed"]'));
    expect(spec.value.axes.x.min).toBe(0);
    expect(spec.value.axes.x.max).toBe('auto');
    setValue(byLabel(m!.root, 'Axis maximum'), '150');
    setValue(byLabel(m!.root, 'Axis minimum'), '-10');
    expect(spec.value.axes.x).toMatchObject({ min: -10, max: 150 });
    setValue(byLabel(m!.root, 'Axis minimum'), '');
    expect(spec.value.axes.x.min).toBe('auto');
    expect(m!.root.querySelector('[data-range="fixed"]')!.getAttribute('aria-checked')).toBe('true');
    click(m!.root.querySelector('[data-range="auto"]'));
    expect('min' in spec.value.axes.x).toBe(false);
    expect('max' in spec.value.axes.x).toBe(false);
  });

  it('log, reversed, show axis and gridlines are plain toggles', () => {
    mountAxis('y');
    setChecked(byLabel(m!.root, 'Logarithmic'), true);
    setChecked(byLabel(m!.root, 'Reversed'), true);
    setChecked(byLabel(m!.root, 'Show axis'), false);
    setChecked(byLabel(m!.root, 'Gridlines'), false);
    expect(spec.value.axes.y).toMatchObject({ log: true, reversed: true, showAxis: false, gridlines: false });
    expect(spec.value.axes.x).toEqual(defaultAxis());
  });

  it('tick format: kind, decimals, units, currency write tickFormat; automatic removes it', () => {
    mountAxis('y');
    setValue(byLabel(m!.root, 'Tick format kind'), 'number');
    expect(spec.value.axes.y.tickFormat).toEqual({ kind: 'number' });
    setValue(byLabel(m!.root, 'Tick decimals'), '1');
    setValue(byLabel(m!.root, 'Tick units'), 'K');
    setValue(byLabel(m!.root, 'Suffix'), ' MW');
    expect(spec.value.axes.y.tickFormat).toEqual({ kind: 'number', decimals: 1, units: 'K', suffix: ' MW' });
    expect(m!.root.querySelector('.preview')!.textContent).toContain('1,234.6K MW');
    setValue(byLabel(m!.root, 'Tick format kind'), 'currency');
    expect(spec.value.axes.y.tickFormat).toMatchObject({ kind: 'currency', currency: 'USD', decimals: 1, units: 'K' });
    expect(byLabel(m!.root, 'Suffix')).toBeUndefined();
    setValue(byLabel(m!.root, 'Tick format kind'), 'percent');
    expect(byLabel(m!.root, 'Tick units')).toBeUndefined();
    setValue(byLabel(m!.root, 'Tick format kind'), 'automatic');
    expect('tickFormat' in spec.value.axes.y).toBe(false);
  });

  it('x axis has no synchronize or combo controls', () => {
    spec.patch((d) => { d.chartType = 'combo'; });
    mountAxis('x');
    expect(byLabel(m!.root, 'Synchronize axes')).toBeUndefined();
    expect(m!.root.querySelector('[data-combo-mark]')).toBeNull();
  });

  it('synchronize is disabled until a secondary axis exists, then toggles axes.synchronized', () => {
    mountAxis('y2');
    const sync = byLabel(m!.root, 'Synchronize axes') as HTMLInputElement;
    expect(sync.disabled).toBe(true);
    m!.unmount();
    const a = newPill(meta('price', 'number'), 'rows');
    const b = newPill(meta('load', 'number'), 'rows');
    b.axis = 'secondary';
    spec.patch((d) => { d.shelves.rows = [a, b]; });
    mountAxis('y');
    const sync2 = byLabel(m!.root, 'Synchronize axes') as HTMLInputElement;
    expect(sync2.disabled).toBe(false);
    setChecked(sync2, true);
    expect(spec.value.axes.synchronized).toBe(true);
  });

  it('combo chart: the mark per axis writes marks.markByAxis for the dialog axis', () => {
    spec.patch((d) => { d.chartType = 'combo'; });
    mountAxis('y2');
    expect(m!.root.querySelector('[data-combo-mark="line"]')!.getAttribute('aria-checked')).toBe('true');
    click(m!.root.querySelector('[data-combo-mark="area"]'));
    expect(spec.value.marks.markByAxis).toEqual({ primary: 'bar', secondary: 'area' });
    m!.unmount();
    mountAxis('y');
    click(m!.root.querySelector('[data-combo-mark="line"]'));
    expect(spec.value.marks.markByAxis).toEqual({ primary: 'line', secondary: 'area' });
  });

  it('reset returns the axis to defaults and leaves the others alone', () => {
    spec.patch((d) => { d.axes.y = { ...defaultAxis(), title: 'T', min: 1, max: 2, log: true, tickFormat: { kind: 'percent' } }; d.axes.x.reversed = true; });
    mountAxis('y');
    click(Array.from(m!.root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reset axis'));
    expect(spec.value.axes.y).toEqual(defaultAxis());
    expect(spec.value.axes.x.reversed).toBe(true);
  });
});
