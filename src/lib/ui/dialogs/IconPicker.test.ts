// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultSpec, newPill } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { getIconSet } from '../../icons';
import { spec } from '../../stores/spec.svelte';
import IconPicker, { matchedCount, shapeSetOf } from './IconPicker.svelte';
import { byText, click, mountComponent, setValue, settle, type Mounted } from '../fields/svelte-mount.test';

const LABELS = ['Gas', 'Wind', 'Lignite', 'Zzz'];

async function open(labels: string[] = LABELS): Promise<Mounted> {
  const m = mountComponent(IconPicker, { open: true, onclose: () => {}, labelsOf: async () => labels });
  await settle();
  return m;
}

function row(m: Mounted, label: string): HTMLElement {
  const el = m.root.querySelector<HTMLElement>(`.override[data-label="${label}"]`);
  if (!el) throw new Error(`no row for ${label}`);
  return el;
}

describe('shapeSetOf / matchedCount', () => {
  it('falls back to the basic set for an unknown or missing id and counts name matches', () => {
    expect(shapeSetOf(undefined).id).toBe('basic');
    expect(shapeSetOf('nope').id).toBe('basic');
    expect(shapeSetOf('power-gen').id).toBe('power-gen');
    expect(matchedCount(getIconSet('power-gen')!, LABELS)).toBe(3);
    expect(matchedCount(getIconSet('basic')!, LABELS)).toBe(0);
  });
});

describe('IconPicker', () => {
  let m: Mounted | null = null;

  beforeEach(() => {
    const s = createDefaultSpec('ds');
    s.shelves.shape = [newPill(meta('fuel', 'string'), 'shape')];
    spec.replace(s, { history: false });
    return () => { m?.unmount(); m = null; };
  });

  it('lists the sets in registry order with the basic set active by default and draws every icon', async () => {
    m = await open();
    const sets = Array.from(m.root.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(sets.map((s) => s.querySelector('.set__name')?.textContent)).toEqual(['Basic', 'Power generation', 'Grid', 'Weather', 'Arrows', 'Places']);
    expect(sets[0]?.getAttribute('aria-selected')).toBe('true');
    expect(sets[0]?.querySelectorAll('svg path').length).toBe(12);
    expect(m.root.querySelector('[data-testid="shape-summary"]')?.textContent).toMatch(/Shape by fuel · set Basic · 0 of 4 values matched by name/);
  });

  it('choosing a set patches marks.shapeSet, re-resolves rows by name, and reports the match count', async () => {
    m = await open();
    click(byText(m.root, '.set__name', 'Power generation')?.closest('button'));
    expect(spec.value.marks.shapeSet).toBe('power-gen');
    expect(m.root.querySelector('[data-testid="shape-summary"]')?.textContent).toMatch(/3 of 4 values matched by name/);
    expect(row(m, 'Gas').querySelector('select')?.value).toBe('gas');
    expect(row(m, 'Lignite').querySelector('select')?.value).toBe('coal');
    expect(row(m, 'Lignite').querySelector('.override__how')?.textContent).toBe('name');
    // Unmatched labels take the remaining icons by position: wind, gas and coal are claimed, so the first free one is solar.
    expect(row(m, 'Zzz').querySelector('select')?.value).toBe('solar');
    expect(row(m, 'Zzz').querySelector('.override__how')?.textContent).toBe('position');
  });

  it('a per-value override is written, shown with Reset, and cleared again; Clear all removes the map', async () => {
    m = await open();
    click(byText(m.root, '.set__name', 'Power generation')?.closest('button'));
    setValue(row(m, 'Zzz').querySelector('select'), 'nuclear');
    expect(spec.value.marks.shapeOverrides).toEqual({ Zzz: 'nuclear' });
    expect(row(m, 'Zzz').querySelector('.override__how')?.textContent).toBe('override');
    expect(row(m, 'Zzz').querySelector('svg path')?.getAttribute('d')).toBe(getIconSet('power-gen')!.icons.find((i) => i.id === 'nuclear')!.path);
    setValue(row(m, 'Gas').querySelector('select'), 'oil');
    expect(spec.value.marks.shapeOverrides).toEqual({ Zzz: 'nuclear', Gas: 'oil' });
    click(row(m, 'Zzz').querySelector('button'));
    expect(spec.value.marks.shapeOverrides).toEqual({ Gas: 'oil' });
    click(byText(m.root, 'button', 'Clear all'));
    expect(spec.value.marks.shapeOverrides).toBeUndefined();
    expect(spec.value.marks.shapeSet).toBe('power-gen');
  });

  it('an override on the default set pins the set id; switching sets drops overrides; Automatic clears both', async () => {
    m = await open();
    setValue(row(m, 'Zzz').querySelector('select'), 'star');
    expect(spec.value.marks.shapeSet).toBe('basic');
    expect(spec.value.marks.shapeOverrides).toEqual({ Zzz: 'star' });
    click(byText(m.root, '.set__name', 'Weather')?.closest('button'));
    expect(spec.value.marks.shapeSet).toBe('weather');
    expect(spec.value.marks.shapeOverrides).toBeUndefined();
    expect(byText(m.root, 'button', 'Automatic')?.hasAttribute('disabled')).toBe(false);
    click(byText(m.root, 'button', 'Automatic'));
    expect(spec.value.marks.shapeSet).toBeUndefined();
    expect(spec.value.marks.shapeOverrides).toBeUndefined();
    expect(byText(m.root, 'button', 'Automatic')?.hasAttribute('disabled')).toBe(true);
  });

  it('labels beyond the set fall to the overflow icon and are counted in the summary', async () => {
    const many = Array.from({ length: 16 }, (_, i) => `v${i}`);
    m = await open(many);
    click(byText(m.root, '.set__name', 'Power generation')?.closest('button'));
    expect(m.root.querySelector('[data-testid="shape-summary"]')?.textContent).toMatch(/2 beyond the set/);
    expect(row(m, 'v15').querySelector('select')?.value).toBe('other');
    expect(row(m, 'v15').querySelector('.override__how')?.textContent).toBe('overflow');
  });

  it('without a Shape pill it explains and still lets a set be chosen', async () => {
    spec.patch((d) => { d.shelves.shape = []; });
    m = await open();
    expect(m.root.textContent).toContain('No pill on Shape');
    expect(m.root.querySelector('.overrides')).toBeNull();
    click(byText(m.root, '.set__name', 'Arrows')?.closest('button'));
    expect(spec.value.marks.shapeSet).toBe('arrows');
  });
});
