// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultSpec } from '../../core/spec-defaults';
import { GEO_LAYER_FOR_ROLE, GEO_ROLES } from '../../core/constants';
import { spec } from '../../stores/spec.svelte';
import GeoLayerPicker, { GEO_LAYERS, LARGE_LAYER_BYTES, formatBytes, geoLayer, layerWarning } from './GeoLayerPicker.svelte';
import { byText, click, mountComponent, type Mounted } from '../shared/svelte-mount.test';

describe('geo layer catalog', () => {
  it('lists the shipped layers and covers every area role of GEO_LAYER_FOR_ROLE', () => {
    expect(GEO_LAYERS.map((l) => l.id)).toEqual(['us-states', 'world-countries', 'us-counties', 'ercot-zones']);
    for (const role of GEO_ROLES) {
      const id = GEO_LAYER_FOR_ROLE[role];
      if (id) expect(geoLayer(id)?.id).toBe(id);
    }
    expect(geoLayer('nope')).toBeUndefined();
    expect(geoLayer(undefined)).toBeUndefined();
    for (const l of GEO_LAYERS) {
      expect(l.keyProps.length).toBeGreaterThan(0);
      expect(l.bytes).toBeGreaterThan(0);
      expect(l.features).toBeGreaterThan(0);
    }
  });

  it('formats bytes and warns only for large layers under data saver', () => {
    expect(formatBytes(23970)).toBe('24 KB');
    expect(formatBytes(1463432)).toBe('1.5 MB');
    expect(formatBytes(512)).toBe('512 B');
    const counties = geoLayer('us-counties')!;
    const zones = geoLayer('ercot-zones')!;
    expect(counties.bytes).toBeGreaterThanOrEqual(LARGE_LAYER_BYTES);
    expect(layerWarning(counties, true)).toMatch(/1\.5 MB/);
    expect(layerWarning(counties, false)).toBeNull();
    expect(layerWarning(zones, true)).toBeNull();
  });
});

describe('GeoLayerPicker', () => {
  let m: Mounted;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    return () => m?.unmount();
  });

  it('choosing a layer patches spec.geoLayer once; Automatic clears it', () => {
    m = mountComponent(GeoLayerPicker, { open: true, onclose: () => {}, saveData: false });
    const options = Array.from(m.root.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.map((o) => o.querySelector('.layer__name')?.textContent)).toEqual(['US states', 'World countries', 'US counties', 'ERCOT model zones']);
    expect(options.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);
    const before = spec.value;
    click(byText(m.root, '.layer__name', 'ERCOT model zones')?.closest('button'));
    expect(spec.value.geoLayer).toBe('ercot-zones');
    expect(byText(m.root, '.layer__name', 'ERCOT model zones')?.closest('button')?.getAttribute('aria-selected')).toBe('true');
    click(byText(m.root, '.layer__name', 'ERCOT model zones')?.closest('button'));
    spec.undo();
    expect(spec.value).toBe(before);
    spec.redo();
    click(byText(m.root, 'button', 'Automatic'));
    expect(spec.value.geoLayer).toBeUndefined();
    expect(byText(m.root, 'button', 'Automatic')?.hasAttribute('disabled')).toBe(true);
  });

  it('shows the suggested layer as the automatic choice and a data-saver warning on the counties file', () => {
    m = mountComponent(GeoLayerPicker, { open: true, onclose: () => {}, suggested: 'us-states', saveData: true });
    expect(byText(m.root, '.layer__name', 'US states')?.closest('button')?.getAttribute('aria-selected')).toBe('true');
    expect(m.root.textContent).toContain('Automatic: US states');
    const counties = byText(m.root, '.layer__name', 'US counties')?.closest('button');
    expect(counties?.querySelector('.badge--warn')?.textContent).toMatch(/save data/);
    expect(byText(m.root, '.layer__name', 'US states')?.closest('button')?.querySelector('.badge--warn')).toBeNull();
    expect(m.root.textContent).toContain('zone');
  });

  it('renders nothing when closed', () => {
    m = mountComponent(GeoLayerPicker, { open: false, onclose: () => {} });
    expect(m.root.querySelector('[role="dialog"]')).toBeNull();
  });
});
