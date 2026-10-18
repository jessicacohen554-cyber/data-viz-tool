// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pill } from '../../core/types';
import { createDefaultSpec, newPill } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { spec } from '../../stores/spec.svelte';
import PillMenu, { FORMAT_PRESETS, applyFormatPreset, axisMeasures, canDualAxis, comboMarkOf, hasSecondary, presetActive } from './PillMenu.svelte';
import { byText, click, mountComponent, type Mounted } from '../dialogs/mount.test';

const preset = (id: string) => FORMAT_PRESETS.find((p) => p.id === id)!;

describe('PillMenu format presets', () => {
  it('kind presets replace the kind; automatic clears the override', () => {
    expect(applyFormatPreset(undefined, preset('fmt-number'))).toEqual({ kind: 'number' });
    expect(applyFormatPreset({ kind: 'number', decimals: 1, units: 'K' }, preset('fmt-currency'))).toEqual({ kind: 'currency', decimals: 1, units: 'K', currency: 'USD' });
    expect(applyFormatPreset({ kind: 'number', units: 'M' }, preset('fmt-percent'))).toEqual({ kind: 'percent' });
    expect(applyFormatPreset({ kind: 'currency' }, preset('fmt-automatic'))).toBeUndefined();
  });

  it('units and decimals presets merge, promoting automatic to number', () => {
    expect(applyFormatPreset(undefined, preset('fmt-units-m'))).toEqual({ kind: 'number', units: 'M' });
    expect(applyFormatPreset({ kind: 'currency', decimals: 0 }, preset('fmt-dec-2'))).toEqual({ kind: 'currency', decimals: 2 });
    expect(applyFormatPreset({ kind: 'percent' }, preset('fmt-dec-0'))).toEqual({ kind: 'percent', decimals: 0 });
  });

  it('presetActive reflects the current format', () => {
    expect(presetActive(undefined, preset('fmt-automatic'))).toBe(true);
    expect(presetActive(undefined, preset('fmt-units-none'))).toBe(false);
    expect(presetActive({ kind: 'number', units: 'K', decimals: 2 }, preset('fmt-units-k'))).toBe(true);
    expect(presetActive({ kind: 'number', units: 'K', decimals: 2 }, preset('fmt-dec-2'))).toBe(true);
    expect(presetActive({ kind: 'number' }, preset('fmt-number'))).toBe(true);
  });
});

describe('PillMenu dual-axis helpers', () => {
  it('axis measures are aggregated measures on rows / columns; dual axis needs two of them', () => {
    const s = createDefaultSpec('d');
    const price = newPill(meta('price', 'number'), 'rows');
    const load = newPill(meta('load', 'number'), 'rows');
    const zone = newPill(meta('zone', 'string'), 'rows');
    const binned = newPill(meta('temp', 'number'), 'rows');
    binned.bin = { count: 10 }; binned.role = 'dimension';
    s.shelves.rows = [price, zone, binned];
    expect(axisMeasures(s, 'rows').map((p) => p.field)).toEqual(['price']);
    expect(canDualAxis(s, price, 'rows')).toBe(false);
    s.shelves.rows.push(load);
    expect(canDualAxis(s, price, 'rows')).toBe(true);
    expect(canDualAxis(s, load, 'rows')).toBe(true);
    expect(canDualAxis(s, zone, 'rows')).toBe(false);
    expect(canDualAxis(s, price, 'color')).toBe(false);
    expect(hasSecondary(s)).toBe(false);
    load.axis = 'secondary';
    expect(hasSecondary(s)).toBe(true);
    expect(comboMarkOf(s, price)).toBe('bar');
    expect(comboMarkOf(s, load)).toBe('line');
    s.marks.markByAxis = { primary: 'area', secondary: 'bar' };
    expect(comboMarkOf(s, load)).toBe('bar');
  });
});

describe('PillMenu component (T4 entries)', () => {
  let m: Mounted | null = null;
  let price: Pill;
  let load: Pill;

  function mountMenu(pill: Pill): Mounted {
    m = mountComponent(PillMenu, { pill, shelf: 'rows', anchor: null, meta: meta(pill.field, 'number'), onClose: () => {} });
    return m;
  }

  /** Click the menu row whose label reads `label` (drills into a submenu or selects). */
  function pick(label: string): void {
    const row = byText(m!.root, '.menu__label', label)?.closest('button');
    if (!row) throw new Error(`no menu row "${label}"`);
    click(row);
  }

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    price = newPill(meta('price', 'number'), 'rows');
    load = newPill(meta('load', 'number'), 'rows');
    spec.patch((d) => { d.shelves.rows = [price, load]; d.chartType = 'line'; });
    return () => { m?.unmount(); m = null; };
  });

  it('number format presets write Pill.format without the dialog', () => {
    mountMenu(price);
    pick('Number format');
    pick('Currency');
    expect(spec.findPill(price.id)!.pill.format).toEqual({ kind: 'currency', currency: 'USD' });
    mountMenu(spec.findPill(price.id)!.pill);
    pick('Number format');
    pick('Units: K');
    expect(spec.findPill(price.id)!.pill.format).toEqual({ kind: 'currency', currency: 'USD', units: 'K' });
    mountMenu(spec.findPill(price.id)!.pill);
    pick('Number format');
    pick('Automatic');
    expect('format' in spec.findPill(price.id)!.pill).toBe(false);
  });

  it('a lone measure has no dual-axis entry; two measures do, and the toggle writes Pill.axis', () => {
    spec.patch((d) => { d.shelves.rows = [price]; });
    mountMenu(price);
    expect(byText(m!.root, '.menu__label', 'Dual axis')).toBeUndefined();
    m!.unmount();
    spec.patch((d) => { d.shelves.rows = [price, load]; });
    mountMenu(load);
    expect(byText(m!.root, '.menu__label', 'Synchronize axis')).toBeUndefined();
    pick('Dual axis');
    expect(spec.findPill(load.id)!.pill.axis).toBe('secondary');
    mountMenu(spec.findPill(load.id)!.pill);
    expect(byText(m!.root, '.menu__label', 'Dual axis')!.closest('button')!.getAttribute('aria-checked')).toBe('true');
    pick('Synchronize axis');
    expect(spec.value.axes.synchronized).toBe(true);
    mountMenu(spec.findPill(load.id)!.pill);
    pick('Dual axis');
    expect('axis' in spec.findPill(load.id)!.pill).toBe(false);
  });

  it('on a combo chart the Mark type submenu writes marks.markByAxis for the pill axis', () => {
    spec.patch((d) => { d.chartType = 'combo'; });
    mountMenu(price);
    expect(byText(m!.root, '.menu__label', 'Mark type')).not.toBeUndefined();
    pick('Mark type');
    pick('Area');
    expect(spec.value.marks.markByAxis).toEqual({ primary: 'area', secondary: 'line' });
    m!.unmount();
    spec.patch((d) => { d.chartType = 'line'; });
    mountMenu(price);
    expect(byText(m!.root, '.menu__label', 'Mark type')).toBeUndefined();
  });
});
