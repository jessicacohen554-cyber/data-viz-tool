import { describe, expect, it } from 'vitest';
import { type GeoFeature, type GeoLayer, bounds, centroid, featureKey, joinRegions, normalizeKey } from './geo';
import { clearGeoLayers, geoUrl, getGeoLayer, loadGeoLayer, loadedGeoLayers, registerGeoLayer } from './geo-loader';
import { zonesLayer } from './test-fixtures';

const feature = (props: Record<string, unknown>, coords: number[][][]): GeoFeature => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: coords as [number, number][][] } });

describe('normalizeKey and join', () => {
  it('normalizes case, separators and leading zeros of digit codes', () => {
    expect(normalizeKey(' South_Central ')).toBe('south central');
    expect(normalizeKey('06')).toBe('6');
    expect(normalizeKey(6)).toBe('6');
    expect(normalizeKey(null)).toBe('');
  });

  it('picks the key property that matches the most labels and lists the unmatched', () => {
    const layer = zonesLayer();
    const byName = joinRegions(['north', 'South', 'West'], layer);
    expect(byName.prop).toBe('zone');
    expect([...byName.byLabel.keys()]).toEqual(['north', 'South']);
    expect(byName.unmatched).toEqual(['West']);
    const byCode = joinRegions(['N', 'S'], layer);
    expect(byCode.prop).toBe('code');
    expect(byCode.unmatched).toEqual([]);
    expect(featureKey(byCode.byLabel.get('N')!, 'zone')).toBe('North');
  });
});

describe('centroid and bounds', () => {
  it('unit square → its centre; a MultiPolygon weights by area so islands do not pull the point', () => {
    const sq = feature({}, [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]);
    expect(centroid(sq)).toEqual([0.5, 0.5]);
    const multi: GeoFeature = {
      type: 'Feature', properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [
        [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        [[[100, 100], [101, 100], [101, 101], [100, 101], [100, 100]]],
      ] },
    };
    const c = centroid(multi)!;
    expect(c[0]).toBeCloseTo((5 * 100 + 100.5 * 1) / 101);
    expect(centroid({ type: 'Feature', properties: {}, geometry: null })).toBeNull();
  });

  it('bounds span every ring', () => {
    const layer: GeoLayer = zonesLayer();
    expect(bounds(layer)).toEqual([0, 0, 1, 2]);
  });
});

describe('geo-loader', () => {
  it('registers from memory, caches by id, builds URLs from the base and loads through an injected fetcher', async () => {
    clearGeoLayers();
    expect(getGeoLayer('test-zones')).toBeUndefined();
    zonesLayer();
    expect(getGeoLayer('test-zones')?.info.keyProps).toEqual(['zone', 'code']);
    expect(loadedGeoLayers()).toEqual(['test-zones']);
    expect(geoUrl('us-states.geojson').endsWith('geo/us-states.geojson')).toBe(true);
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      if (url.endsWith('index.json')) return { ok: true, status: 200, json: async () => [{ id: 'sq', file: 'sq.geojson', label: 'Square', kind: 'choropleth', keyProps: ['name'] }] };
      return { ok: true, status: 200, json: async () => ({ type: 'FeatureCollection', features: [feature({ name: 'A' }, [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])] }) };
    };
    const layer = await loadGeoLayer('sq', fetcher);
    expect(layer.geojson.features).toHaveLength(1);
    await loadGeoLayer('sq', fetcher);
    expect(calls).toHaveLength(2);
    await expect(loadGeoLayer('nope', fetcher)).rejects.toThrow(/not in index.json/);
    registerGeoLayer({ id: 'x', file: 'x', label: 'x', kind: 'choropleth', keyProps: [] }, { type: 'FeatureCollection', features: [] });
    expect(loadedGeoLayers().sort()).toEqual(['sq', 'test-zones', 'x']);
    clearGeoLayers();
    zonesLayer();
  });
});
