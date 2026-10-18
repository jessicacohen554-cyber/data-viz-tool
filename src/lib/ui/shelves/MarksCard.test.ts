// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldMeta } from '../../core/types';
import { DEFAULT_ENVELOPE_LEVELS } from '../../core/constants';
import { createDefaultSpec, newPill } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { spec } from '../../stores/spec.svelte';
import MarksCard, { ENVELOPE_PRESETS, defaultEnvelope, defaultMapMark, hasLevel, isMapChart, suggestedGeoLayer, toggleLevel } from './MarksCard.svelte';
import { byText, click, flush, mountComponent, setValue, type Mounted } from '../shared/svelte-mount.test';

function fields(): FieldMeta[] {
  return [{ ...meta('zone', 'string'), geoRole: 'ercot-zone' }, meta('state', 'string'), meta('price', 'number'), meta('lo', 'number'), meta('hi', 'number')];
}

function mountCard(): Mounted {
  return mountComponent(MarksCard, { meta: fields(), onPillMenu: () => {} });
}

function chip(m: Mounted, id: string): HTMLElement {
  const el = m.root.querySelector<HTMLElement>(`[data-level="${id}"]`);
  if (!el) throw new Error(`no chip ${id}`);
  return el;
}

describe('MarksCard helpers', () => {
  it('toggleLevel adds outer-first, removes, and never empties the list', () => {
    expect(toggleLevel([[25, 75]], [5, 95])).toEqual([[5, 95], [25, 75]]);
    expect(toggleLevel([[5, 95], [25, 75]], [10, 90])).toEqual([[5, 95], [10, 90], [25, 75]]);
    expect(toggleLevel([[5, 95], [25, 75]], [25, 75])).toEqual([[5, 95]]);
    expect(toggleLevel([[5, 95]], [5, 95])).toEqual([[5, 95]]);
    expect(hasLevel(DEFAULT_ENVELOPE_LEVELS, [25, 75])).toBe(true);
    expect(hasLevel(DEFAULT_ENVELOPE_LEVELS, [10, 90])).toBe(false);
    expect(defaultEnvelope()).toEqual({ mode: 'percentile', levels: [[5, 95], [25, 75]] });
    expect(ENVELOPE_PRESETS.map((p) => p.label)).toEqual(['P5–P95', 'P10–P90', 'P25–P75']);
  });

  it('map helpers: chart kinds, default mark, suggested layer from the first geo pill', () => {
    expect(isMapChart('map-choropleth')).toBe(true);
    expect(isMapChart('map-symbol')).toBe(true);
    expect(isMapChart('bar')).toBe(false);
    expect(defaultMapMark('map-choropleth')).toBe('fill');
    expect(defaultMapMark('map-symbol')).toBe('symbol');
    const s = createDefaultSpec('ds');
    const f = fields();
    expect(suggestedGeoLayer(s, f)).toBeUndefined();
    s.shelves.detail = [newPill(f[0]!, 'detail')];
    expect(suggestedGeoLayer(s, f)).toBe('ercot-zones');
    s.typeOverrides.zone = { geoRole: 'us-state' };
    expect(suggestedGeoLayer(s, f)).toBe('us-states');
    s.typeOverrides.zone = { geoRole: 'latitude' };
    expect(suggestedGeoLayer(s, f)).toBeUndefined();
    s.shelves.columns = [newPill(f[1]!, 'columns')];
    s.typeOverrides.state = { geoRole: 'country' };
    expect(suggestedGeoLayer(s, f)).toBe('world-countries');
  });
});

describe('MarksCard sections', () => {
  let m: Mounted | null = null;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    return () => { m?.unmount(); m = null; };
  });

  it('shows no map, envelope or icons section for an ordinary chart', () => {
    spec.patch((d) => { d.chartType = 'bar'; });
    m = mountCard();
    expect(m.root.querySelector('[data-section]')).toBeNull();
    expect(m.root.querySelectorAll('[data-shelf]').length).toBe(6);
  });

  it('envelope: the level chips toggle nested levels in the spec, outer first, keeping one band', () => {
    spec.patch((d) => { d.chartType = 'envelope'; });
    m = mountCard();
    expect(m.root.querySelector('[data-section="envelope"]')).not.toBeNull();
    expect(spec.value.envelope).toBeUndefined();
    expect(chip(m, 'p5-p95').getAttribute('aria-pressed')).toBe('true');
    expect(chip(m, 'p10-p90').getAttribute('aria-pressed')).toBe('false');
    expect(chip(m, 'p25-p75').getAttribute('aria-pressed')).toBe('true');
    click(chip(m, 'p10-p90'));
    expect(spec.value.envelope).toEqual({ mode: 'percentile', levels: [[5, 95], [10, 90], [25, 75]] });
    click(chip(m, 'p5-p95'));
    click(chip(m, 'p25-p75'));
    expect(spec.value.envelope?.levels).toEqual([[10, 90]]);
    expect(chip(m, 'p10-p90').getAttribute('aria-pressed')).toBe('true');
    const before = spec.value;
    click(chip(m, 'p10-p90'));
    expect(spec.value).toBe(before);
    expect(chip(m, 'p10-p90').getAttribute('title')).toMatch(/At least one band/);
  });

  it('envelope: columns mode exposes low / high / mid pickers over the measures', () => {
    spec.patch((d) => { d.chartType = 'envelope'; });
    m = mountCard();
    click(byText(m.root, '[role="radio"]', 'Low / high columns'));
    expect(spec.value.envelope?.mode).toBe('columns');
    expect(spec.value.envelope?.levels).toEqual([[5, 95], [25, 75]]);
    expect(m.root.querySelector('[data-level]')).toBeNull();
    const low = m.root.querySelector<HTMLSelectElement>('select[aria-label="Envelope low field"]')!;
    expect(Array.from(low.options).map((o) => o.value)).toEqual(['', 'price', 'lo', 'hi']);
    setValue(low, 'lo');
    setValue(m.root.querySelector('select[aria-label="Envelope high field"]'), 'hi');
    setValue(m.root.querySelector('select[aria-label="Envelope mid field"]'), 'price');
    expect(spec.value.envelope).toEqual({ mode: 'columns', levels: [[5, 95], [25, 75]], low: 'lo', high: 'hi', mid: 'price' });
    setValue(m.root.querySelector('select[aria-label="Envelope mid field"]'), '');
    expect(spec.value.envelope?.mid).toBeUndefined();
    click(byText(m.root, '[role="radio"]', 'Percentile bands'));
    expect(spec.value.envelope?.mode).toBe('percentile');
    expect(m.root.querySelectorAll('[data-level]').length).toBe(3);
  });

  it('map: mark and layer selectors patch marks.mapMark and geoLayer; the automatic layer follows the geo pill', () => {
    spec.patch((d) => { d.chartType = 'map-choropleth'; d.shelves.detail = [newPill(fields()[0]!, 'detail')]; });
    m = mountCard();
    const section = m.root.querySelector('[data-section="map"]')!;
    const mark = section.querySelector<HTMLSelectElement>('select[aria-label="Map mark"]')!;
    expect(mark.value).toBe('fill');
    expect(Array.from(mark.options).map((o) => o.value)).toEqual(['fill', 'symbol', 'bubble', 'heat', 'label']);
    setValue(mark, 'bubble');
    expect(spec.value.marks.mapMark).toBe('bubble');
    const layer = section.querySelector<HTMLSelectElement>('select[aria-label="Map layer"]')!;
    expect(layer.value).toBe('');
    expect(layer.options[0]?.textContent).toBe('Automatic (ERCOT model zones)');
    expect(Array.from(layer.options).map((o) => o.value)).toEqual(['', 'us-states', 'world-countries', 'us-counties', 'ercot-zones']);
    setValue(layer, 'us-counties');
    expect(spec.value.geoLayer).toBe('us-counties');
    setValue(layer, '');
    expect(spec.value.geoLayer).toBeUndefined();
    spec.patch((d) => { d.chartType = 'map-symbol'; delete d.marks.mapMark; });
    flush();
    expect(mark.value).toBe('symbol');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    click(byText(section, 'button', 'Layers…'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Map layer');
  });

  it('shape: a Shape pill shows the set summary and the Icons… button opens the picker', () => {
    m = mountCard();
    expect(m.root.querySelector('[data-section="shape"]')).toBeNull();
    spec.patch((d) => { d.shelves.shape = [newPill(fields()[1]!, 'shape')]; d.marks.shapeSet = 'power-gen'; });
    flush();
    const row = m.root.querySelector('[data-section="shape"]')!;
    expect(row.textContent).toContain('Shape by state · Power generation');
    click(byText(row, 'button', 'Icons…'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Shape icons');
  });
});
