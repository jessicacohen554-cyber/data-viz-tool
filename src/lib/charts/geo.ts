/**
 * Pure GeoJSON helpers for the map charts (docs/CHARTS.md §Maps): the layer
 * shapes of `public/geo/index.json`, the label → region join over a layer's
 * `keyProps` (name / code / fips / zone), and area-weighted centroids for
 * symbol marks. No fetching and no ECharts here: `geo-loader.ts` owns the
 * network and `registerMap`. Framework-free (rule R-PURE).
 */

/** A GeoJSON position `[lon, lat]`. */
export type Position = [number, number];

/** Polygon or MultiPolygon geometry (the only kinds the shipped layers carry). */
export type GeoGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

/** One region. */
export interface GeoFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoGeometry | null;
}

/** A layer file. */
export interface GeoJson {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

/** One row of `public/geo/index.json`. */
export interface GeoLayerInfo {
  id: string;
  file: string;
  label: string;
  kind: string;
  /** Feature properties a data value may name a region by, most specific first. */
  keyProps: string[];
}

/** A loaded layer: its catalog row and its features. */
export interface GeoLayer {
  info: GeoLayerInfo;
  geojson: GeoJson;
}

/**
 * Canonical form of a join key: trimmed, lower-cased, runs of spaces,
 * underscores and hyphens collapsed to one space, and leading zeros dropped
 * from all-digit codes (`'06'` and `6` both name California).
 */
export function normalizeKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

/** The value of a feature's property as a display string (`''` when absent). */
export function featureKey(f: GeoFeature, prop: string): string {
  const v = f.properties[prop];
  return v === null || v === undefined ? '' : String(v);
}

/** Result of joining data labels to a layer. */
export interface RegionJoin {
  /** The `keyProps` entry that matched the most labels (the series' `nameProperty`). */
  prop: string;
  /** Label → feature for every matched label. */
  byLabel: Map<string, GeoFeature>;
  /** Labels that matched no region, in first-appearance order. */
  unmatched: string[];
}

/**
 * Join distinct labels to the layer's regions. Every `keyProps` property is
 * tried and the one matching the most labels wins, so a column of state codes
 * and a column of state names both work. Matching is `normalizeKey`-exact;
 * the returned `prop` is what the ECharts map series must use as `nameProperty`.
 */
export function joinRegions(labels: string[], layer: GeoLayer): RegionJoin {
  const distinct = [...new Set(labels)];
  let best: RegionJoin = { prop: layer.info.keyProps[0] ?? 'name', byLabel: new Map(), unmatched: distinct };
  for (const prop of layer.info.keyProps) {
    const index = new Map<string, GeoFeature>();
    for (const f of layer.geojson.features) { const k = normalizeKey(f.properties[prop]); if (k && !index.has(k)) index.set(k, f); }
    const byLabel = new Map<string, GeoFeature>();
    const unmatched: string[] = [];
    for (const l of distinct) { const f = index.get(normalizeKey(l)); if (f) byLabel.set(l, f); else unmatched.push(l); }
    if (byLabel.size > best.byLabel.size || (best.byLabel.size === 0 && prop === best.prop)) best = { prop, byLabel, unmatched };
  }
  return best;
}

/** Signed area (shoelace, in degrees²) and area-weighted centroid of one ring. */
function ringCentroid(ring: Position[]): { area: number; cx: number; cy: number } {
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i]!; const [x1, y1] = ring[(i + 1) % n]!;
    const cross = x0 * y1 - x1 * y0;
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  if (a === 0) {
    const n = ring.length || 1;
    return { area: 0, cx: ring.reduce((t, p) => t + p[0], 0) / n, cy: ring.reduce((t, p) => t + p[1], 0) / n };
  }
  return { area: a / 2, cx: cx / (3 * a), cy: cy / (3 * a) };
}

/**
 * Area-weighted centroid of a feature's outer rings (holes ignored), so a
 * MultiPolygon such as a coastal zone lands on its mainland, not between
 * its islands. `null` for a feature without geometry.
 */
export function centroid(f: GeoFeature): Position | null {
  const g = f.geometry;
  if (!g) return null;
  const outers: Position[][] = g.type === 'Polygon' ? [g.coordinates[0] ?? []] : g.coordinates.map((poly) => poly[0] ?? []);
  let area = 0; let cx = 0; let cy = 0;
  for (const ring of outers) {
    if (ring.length === 0) continue;
    const r = ringCentroid(ring);
    const w = Math.abs(r.area);
    area += w; cx += r.cx * w; cy += r.cy * w;
  }
  if (area === 0) {
    const first = outers.find((r) => r.length > 0);
    return first ? [first[0]![0], first[0]![1]] : null;
  }
  return [cx / area, cy / area];
}

/** Bounding box `[minLon, minLat, maxLon, maxLat]` of a layer (for symbol-only maps with no base region). */
export function bounds(layer: GeoLayer): [number, number, number, number] | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const visit = (p: Position) => { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; };
  for (const f of layer.geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') for (const ring of g.coordinates) ring.forEach(visit);
    else for (const poly of g.coordinates) for (const ring of poly) ring.forEach(visit);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}
