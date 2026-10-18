/** Show Me rules for the v2 types (CHARTS.md §2–§3): envelope, combo, maps. */
import { describe, expect, it } from 'vitest';
import { arrangeFor, eligibility, suggest } from './show-me';
import { date, dim, fieldMeta, makeSpec, measure } from './test-fixtures';

const reasonOf = (spec: ReturnType<typeof makeSpec>, id: string, meta = [] as ReturnType<typeof fieldMeta>[]) => eligibility(spec, meta).find((e) => e.id === id)!;

describe('eligibility (v2)', () => {
  it('envelope needs a date/continuous x on Columns and a measure (or low/high pills in columns mode)', () => {
    expect(reasonOf(makeSpec('envelope', { rows: [dim('hour'), measure('p')] }), 'envelope').reason).toMatch(/Columns/);
    expect(reasonOf(makeSpec('envelope', { columns: [date('ts', 'hour', 'part')], rows: [measure('p')] }), 'envelope').ok).toBe(true);
    const cols = makeSpec('envelope', { columns: [dim('hour')], rows: [measure('p')] }, (s) => { s.envelope = { mode: 'columns', levels: [] }; });
    expect(reasonOf(cols, 'envelope').reason).toMatch(/low and high/);
    cols.shelves.rows.push(measure('q'));
    expect(reasonOf(cols, 'envelope').ok).toBe(true);
  });

  it('combo and the area variants join the 1 D + 1 M family', () => {
    const spec = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] });
    for (const id of ['combo', 'area-stacked', 'area-100']) expect(reasonOf(spec, id).ok).toBe(true);
  });

  it('maps need a geographic dimension (by role, override or name) or latitude + longitude', () => {
    const noGeo = makeSpec('bar', { columns: [dim('fuel')], rows: [measure('p')] });
    expect(reasonOf(noGeo, 'map-choropleth').reason).toMatch(/geographic field/);
    expect(reasonOf(noGeo, 'map-symbol').reason).toMatch(/geographic field/);
    const byName = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] });
    expect(reasonOf(byName, 'map-choropleth').ok).toBe(true);
    const byMeta = makeSpec('bar', { columns: [dim('region')], rows: [measure('p')] });
    expect(reasonOf(byMeta, 'map-choropleth', [{ ...fieldMeta('region'), geoRole: 'us-state' }]).ok).toBe(true);
    expect(reasonOf(byMeta, 'map-choropleth').ok).toBe(false);
    const latLon = makeSpec('scatter', { columns: [measure('lon')], rows: [measure('lat')] });
    expect(reasonOf(latLon, 'map-symbol').ok).toBe(true);
    const explicitLayer = makeSpec('bar', { columns: [dim('region')], rows: [measure('p')] }, (s) => { s.geoLayer = 'us-states'; });
    expect(reasonOf(explicitLayer, 'map-choropleth').ok).toBe(true);
  });
});

describe('suggest (v2)', () => {
  it('suggests a filled map only for an assigned geo role, never from the name fallback', () => {
    const spec = makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] });
    expect(suggest(spec, [])).toBe('bar');
    expect(suggest(spec, [{ ...fieldMeta('zone'), geoRole: 'ercot-zone' }])).toBe('map-choropleth');
    expect(suggest(spec, [{ ...fieldMeta('zone'), geoRole: 'latitude' }])).toBe('bar');
  });
});

describe('arrangeFor (v2)', () => {
  it('combo: x on Columns, every measure on Rows with the second and later on the right axis', () => {
    const z = dim('zone'); const p = measure('p'); const q = measure('q'); const r = measure('r', 'sum', { axis: 'primary' });
    const draft = makeSpec('bar', { columns: [z], rows: [p], detail: [q, r] });
    arrangeFor(draft, 'combo');
    expect(draft.chartType).toBe('combo');
    expect(draft.shelves.columns.map((x) => x.id)).toEqual([z.id]);
    expect(draft.shelves.rows.map((x) => [x.id, x.axis])).toEqual([[p.id, undefined], [q.id, 'secondary'], [r.id, 'primary']]);
  });

  it('envelope: date first, then up to three measures (low/high/mid)', () => {
    const t = date('ts', 'hour', 'part'); const z = dim('zone'); const lo = measure('lo'); const hi = measure('hi'); const mid = measure('mid'); const extra = measure('x');
    const draft = makeSpec('bar', { columns: [z], rows: [lo], color: [t], detail: [hi, mid, extra] });
    arrangeFor(draft, 'envelope');
    expect(draft.shelves.columns[0]!.id).toBe(t.id);
    expect(draft.shelves.rows.map((x) => x.id)).toEqual([lo.id, hi.id, mid.id]);
    expect(draft.shelves.detail.map((x) => x.id)).toEqual([z.id, extra.id]);
  });

  it('maps: the geographic dimension (by name) goes to Columns; choropleth colors by the measure, symbol sizes by it; lat/lon become axes', () => {
    const fuel = dim('fuel'); const zone = dim('zone'); const p = measure('p');
    const ch = makeSpec('bar', { columns: [fuel], rows: [p], color: [zone] });
    arrangeFor(ch, 'map-choropleth');
    expect(ch.shelves.columns[0]!.id).toBe(zone.id);
    expect(ch.shelves.color[0]!.id).toBe(p.id);
    expect(ch.shelves.detail[0]!.id).toBe(fuel.id);
    const lat = measure('lat'); const lon = measure('lon'); const site = dim('site');
    const sy = makeSpec('bar', { columns: [site], rows: [p], detail: [lat, lon] });
    arrangeFor(sy, 'map-symbol');
    expect(sy.shelves.columns[0]!.id).toBe(lon.id);
    expect(sy.shelves.rows[0]!.id).toBe(lat.id);
    expect(sy.shelves.size[0]!.id).toBe(p.id);
    expect(sy.shelves.color[0]!.id).toBe(site.id);
  });
});
