// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldMeta, GeoRole } from '../../core/types';
import { createDefaultSpec } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { spec } from '../../stores/spec.svelte';
import FieldPanel, { effectiveGeoRole, withGeoRole } from './FieldPanel.svelte';
import FieldItem, { geoGlyph } from './FieldItem.svelte';
import { byText, click, mountComponent, type Mounted } from '../shared/svelte-mount.test';

/** zone: string with an inferred ERCOT role; county: plain string; lat: number. */
function fields(): FieldMeta[] {
  return [{ ...meta('zone', 'string'), geoRole: 'ercot-zone' }, meta('county', 'string'), meta('lat', 'number')];
}

/** The menu row whose label is `label` (rows carry a hint and a tick beside the label). */
function row(menu: ParentNode, label: string): HTMLElement | undefined {
  return byText(menu, '.menu__label', label)?.closest<HTMLElement>('.menu__item') ?? undefined;
}

/** Open the field menu for `field` and drill into "Geographic role". */
function openGeoMenu(m: Mounted, field: string): HTMLElement {
  click(m.root.querySelector(`[data-field="${field}"] .field__caret`));
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (!menu) throw new Error('menu did not open');
  expect(row(menu, 'Geographic role')?.querySelector('.menu__hint')?.textContent).toBeDefined();
  click(row(menu, 'Geographic role'));
  return menu;
}

describe('withGeoRole / effectiveGeoRole', () => {
  it('writes a role, drops it when equal to the inferred one, records None over an inferred role as null', () => {
    expect(withGeoRole(undefined, null, 'us-state')).toEqual({ geoRole: 'us-state' });
    expect(withGeoRole({ type: 'string' }, null, 'country')).toEqual({ type: 'string', geoRole: 'country' });
    expect(withGeoRole({ geoRole: 'country' }, 'country', 'country')).toBeUndefined();
    expect(withGeoRole({ geoRole: 'us-state' }, 'ercot-zone', null)).toEqual({ geoRole: null });
    expect(withGeoRole({ geoRole: 'us-state' }, null, null)).toBeUndefined();
    expect(withGeoRole({ role: 'dimension', geoRole: 'us-state' }, null, null)).toEqual({ role: 'dimension' });
  });

  it('effective role: override (including an explicit null) beats the inferred role', () => {
    const z = fields()[0]!;
    expect(effectiveGeoRole({}, z)).toBe('ercot-zone');
    expect(effectiveGeoRole({ zone: { geoRole: 'us-county' } }, z)).toBe('us-county');
    expect(effectiveGeoRole({ zone: { geoRole: null } }, z)).toBeNull();
    expect(effectiveGeoRole({ zone: { type: 'string' } }, z)).toBe('ercot-zone');
  });

  it('area roles draw a globe, lat/lon a pin', () => {
    expect(geoGlyph('country')).toBe('globe');
    expect(geoGlyph('ercot-zone')).toBe('globe');
    expect(geoGlyph('latitude')).toBe('pin');
    expect(geoGlyph('longitude')).toBe('pin');
  });
});

describe('FieldPanel geographic role menu', () => {
  let m: Mounted;
  let changes: Array<[string, GeoRole | null]>;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    changes = [];
    m = mountComponent(FieldPanel, { meta: fields(), onChangeGeoRole: (f, r) => { changes.push([f, r]); } });
    return () => m.unmount();
  });

  it('lists the six roles plus None, with the current role ticked', () => {
    const menu = openGeoMenu(m, 'zone');
    const items = Array.from(menu.querySelectorAll<HTMLElement>('.menu__label')).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Country', 'US State', 'US County', 'ERCOT zone', 'Latitude', 'Longitude', 'None']);
    expect(row(menu, 'ERCOT zone')?.getAttribute('aria-checked')).toBe('true');
    expect(row(menu, 'None')?.getAttribute('aria-checked')).toBe('false');
  });

  it('choosing a role writes typeOverrides[field].geoRole and notifies; the row shows the globe', () => {
    click(row(openGeoMenu(m, 'county'), 'US County'));
    expect(spec.value.typeOverrides.county).toEqual({ geoRole: 'us-county' });
    expect(changes).toEqual([['county', 'us-county']]);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    const item = m.root.querySelector('[data-field="county"]')!;
    expect(item.getAttribute('data-geo-role')).toBe('us-county');
    expect(item.querySelector('.field__type--geo')).not.toBeNull();
  });

  it('None clears a written override (the entry disappears) and keeps other overrides', () => {
    spec.patch((d) => { d.typeOverrides.county = { type: 'string', geoRole: 'country' }; });
    click(row(openGeoMenu(m, 'county'), 'None'));
    expect(spec.value.typeOverrides.county).toEqual({ type: 'string' });
    spec.patch((d) => { d.typeOverrides.lat = { geoRole: 'latitude' }; });
    click(row(openGeoMenu(m, 'lat'), 'None'));
    expect(spec.value.typeOverrides.lat).toBeUndefined();
    expect(changes).toEqual([['county', null], ['lat', null]]);
  });

  it('None over an inferred role records an explicit null; choosing the inferred role again removes it', () => {
    click(row(openGeoMenu(m, 'zone'), 'None'));
    expect(spec.value.typeOverrides.zone).toEqual({ geoRole: null });
    expect(m.root.querySelector('[data-field="zone"]')?.getAttribute('data-geo-role')).toBeNull();
    click(row(openGeoMenu(m, 'zone'), 'ERCOT zone'));
    expect(spec.value.typeOverrides.zone).toBeUndefined();
    expect(m.root.querySelector('[data-field="zone"]')?.getAttribute('data-geo-role')).toBe('ercot-zone');
  });

  it('is one undo step per choice', () => {
    const before = spec.value;
    click(row(openGeoMenu(m, 'lat'), 'Latitude'));
    expect(spec.value.typeOverrides.lat).toEqual({ geoRole: 'latitude' });
    spec.undo();
    expect(spec.value).toBe(before);
  });

  it('a standalone FieldItem draws a pin for latitude from its own meta', () => {
    const onMenu = vi.fn();
    const item = mountComponent(FieldItem, { meta: { ...meta('lat', 'number'), geoRole: 'latitude' }, role: 'measure', onMenu });
    expect(item.root.querySelector('.field')?.getAttribute('aria-label')).toBe('lat, number measure, Latitude');
    expect(item.root.querySelector('.field__geo')).not.toBeNull();
    item.unmount();
  });
});
