/**
 * Shared map builder (docs/CHARTS.md §Maps, D-13/D-17): resolves the
 * geographic pills (an area-role dimension, or latitude + longitude
 * measures), picks the base layer (`spec.geoLayer`, else
 * `GEO_LAYER_FOR_ROLE`), joins labels to regions and draws one of the five
 * map marks: `fill` (choropleth), `symbol` (icon / circle at the centroid or
 * lat/lon), `bubble` (size-scaled circle), `heat` (heatmap on the geo
 * coordinate system) and `label` (region labels). A layer that is not loaded
 * yet yields an empty option with `__meta.geoPending` so the canvas can fetch
 * it and rebuild. Framework-free (rule R-PURE).
 */
import type { FieldMeta, GeoRole, Pill, VizSpec } from '../core/types';
import { GEO_LAYER_FOR_ROLE } from '../core/constants';
import { type GeoFeature, type GeoLayer, type Position, centroid, featureKey, joinRegions } from './geo';
import { getGeoLayer } from './geo-loader';
import {
  type OptionObject, baseOption, classify, dimAccessorFor, escapeHtml, formatterFor, isDimPill, isMeasurePill, legend, measureOf,
  pillLabel, pointCount, seriesColors, seriesOrder, styleFonts, themeOf, tooltip, tooltipRow, visualMap,
} from './option-common';
import type { BuildContext } from './registry';
import { shapeMap } from './shapes';
import { measureAt } from './transforms';
import { sizeScale } from './types/scatter';

/** Geographic roles that name a region of a layer (as opposed to a coordinate). */
export const AREA_ROLES: readonly GeoRole[] = ['country', 'us-state', 'us-county', 'ercot-zone'];

/** Map marks (`MarkSettings.mapMark`). */
export type MapMark = NonNullable<VizSpec['marks']['mapMark']>;

/**
 * Name-based geographic role, used only while `FieldMeta.geoRole` is not yet
 * inferred (`undefined`; `null` means "inferred: none" and is respected).
 * Conservative: whole-word matches on common column names. The integrator
 * deletes this once T1's inference writes `geoRole` (rule R-DELETE).
 */
export function fallbackGeoRole(name: string): GeoRole | null {
  const n = name.trim().toLowerCase();
  if (/^(lat|latitude|y_lat)$/.test(n)) return 'latitude';
  if (/^(lon|lng|long|longitude|x_lon)$/.test(n)) return 'longitude';
  if (/^(zone|load_zone|ercot_zone|weather_zone|settlement_zone)$/.test(n)) return 'ercot-zone';
  if (/^(county|county_name|county_fips)$/.test(n)) return 'us-county';
  if (/^(state|state_code|state_name|us_state|st)$/.test(n)) return 'us-state';
  if (/^(country|country_code|country_name|nation|iso_a2|iso_a3|iso3|iso2)$/.test(n)) return 'country';
  return null;
}

/** Geographic role a user or the inference assigned (override, else `FieldMeta.geoRole`); `undefined` when neither has spoken. */
export function explicitGeoRole(spec: VizSpec, meta: FieldMeta[], field: string): GeoRole | null | undefined {
  const override = spec.typeOverrides[field];
  if (override && 'geoRole' in override) return override.geoRole ?? null;
  const m = meta.find((f) => f.name === field);
  return m?.geoRole;
}

/** Geographic role of a field: the user's override, else the inferred role, else the name fallback. */
export function geoRoleFor(spec: VizSpec, meta: FieldMeta[], field: string): GeoRole | null {
  const explicit = explicitGeoRole(spec, meta, field);
  return explicit === undefined ? fallbackGeoRole(field) : explicit;
}

/** The pills a map draws from. */
export interface GeoPills {
  /** First dimension pill with an area role (or the first dimension when `spec.geoLayer` is set explicitly). */
  area: Pill | undefined;
  lat: Pill | undefined;
  lon: Pill | undefined;
}

/** Find the area dimension and the latitude / longitude measures among the viz pills. */
export function geoPills(spec: VizSpec, meta: FieldMeta[]): GeoPills {
  const c = classify(spec);
  const roleOf = (p: Pill) => geoRoleFor(spec, meta, p.field);
  const allMeasures = [...c.measures, ...spec.shelves.detail.filter(isMeasurePill), ...spec.shelves.tooltip.filter(isMeasurePill)];
  let area = c.dims.find((d) => { const r = roleOf(d); return r !== null && AREA_ROLES.includes(r); });
  if (!area && spec.geoLayer) area = c.dims[0];
  return {
    area,
    lat: allMeasures.find((m) => roleOf(m) === 'latitude'),
    lon: allMeasures.find((m) => roleOf(m) === 'longitude'),
  };
}

/** The layer id a map should draw: the spec's choice, else the layer of the area pill's role. */
export function mapLayerId(spec: VizSpec, meta: FieldMeta[]): string | undefined {
  if (spec.geoLayer) return spec.geoLayer;
  const { area } = geoPills(spec, meta);
  const role = area ? geoRoleFor(spec, meta, area.field) : null;
  return role ? GEO_LAYER_FOR_ROLE[role] : undefined;
}

/** Show Me reason when a spec cannot drive a map, else `null`. */
export function mapUnmet(spec: VizSpec, meta: FieldMeta[], needsMeasure: boolean): string | null {
  const g = geoPills(spec, meta);
  if (!g.area && !(g.lat && g.lon) && !spec.geoLayer) return 'Needs a geographic field (zone, state, county, country) or latitude + longitude';
  if (needsMeasure && classify(spec).measures.filter((m) => m.id !== g.lat?.id && m.id !== g.lon?.id).length === 0) return 'Needs a measure for the color';
  return null;
}

/** Measures that are not coordinates, in shelf order. */
function valueMeasures(spec: VizSpec, g: GeoPills): Pill[] {
  return classify(spec).measures.filter((m) => m.id !== g.lat?.id && m.id !== g.lon?.id);
}

/** One drawn location. */
interface MapPoint { pos: Position; label: string; value: number | null; size: number | null; color: string; shape: string }

/** Build a map option. `defaultMark` is the chart type's own default when `marks.mapMark` is unset. */
export function buildMap(ctx: BuildContext, defaultMark: MapMark): OptionObject {
  const spec = ctx.spec;
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
  const g = geoPills(spec, ctx.meta);
  const layerId = mapLayerId(spec, ctx.meta);
  if (!layerId) throw new Error(`${spec.chartType}: needs a geographic field (zone, state, county, country) or latitude + longitude`);
  const layer = getGeoLayer(layerId);
  const mark: MapMark = spec.marks.mapMark ?? defaultMark;
  if (!layer) return { ...baseOption(ctx, 0), series: [], __meta: { geoLayer: layerId, geoPending: true, mark } };

  const colorShelf = spec.shelves.color[0];
  const colorDim = colorShelf && isDimPill(colorShelf) ? colorShelf : undefined;
  const values = valueMeasures(spec, g);
  const colorM = colorShelf && isMeasurePill(colorShelf) ? colorShelf : values[0];
  const sizePill = spec.shelves.size[0];
  const sizeM = sizePill && isMeasurePill(sizePill) ? sizePill : undefined;
  const labelPill = spec.shelves.label[0];
  const n = ctx.result.groups;
  const vm = measureOf(ctx, colorM);
  const sm = sizeM ? measureOf(ctx, sizeM) : undefined;
  const fmt = formatterFor(ctx, colorM);
  const sizeFmt = formatterFor(ctx, sizeM);
  const labelAt = dimAccessorFor(ctx, labelPill);
  const colorAt = dimAccessorFor(ctx, colorDim);
  const shapeAt = dimAccessorFor(ctx, spec.shelves.shape[0]);
  const areaAt = dimAccessorFor(ctx, g.area);
  const fill = mark === 'fill' || mark === 'label';

  // Region join (area pill) and per-row positions.
  let join: ReturnType<typeof joinRegions> | undefined;
  const centroids = new Map<GeoFeature, Position | null>();
  const centroidOf = (f: GeoFeature) => { if (!centroids.has(f)) centroids.set(f, centroid(f)); return centroids.get(f)!; };
  if (areaAt) {
    const labels: string[] = [];
    for (let i = 0; i < n; i++) labels.push(String(areaAt(i)));
    join = joinRegions(labels, layer);
  }
  const latM = g.lat ? measureOf(ctx, g.lat) : undefined;
  const lonM = g.lon ? measureOf(ctx, g.lon) : undefined;
  const positionOf = (i: number): { pos: Position | null; region: GeoFeature | undefined; label: string } => {
    if (latM && lonM && !fill) {
      const lat = measureAt(latM, i); const lon = measureAt(lonM, i);
      return { pos: lat === null || lon === null ? null : [lon, lat], region: undefined, label: areaAt ? String(areaAt(i)) : labelAt ? String(labelAt(i)) : '' };
    }
    const label = areaAt ? String(areaAt(i)) : '';
    const region = join?.byLabel.get(label);
    return { pos: region ? centroidOf(region) : null, region, label };
  };

  const points = pointCount(ctx);
  const base = { ...baseOption(ctx, points) };
  const geoBase: OptionObject = {
    map: layerId, roam: true, zoom: 1.05, silent: !fill,
    itemStyle: { areaColor: theme.grid, borderColor: theme.bg, borderWidth: 1 },
    emphasis: { disabled: true },
    label: { show: false },
  };
  const unmatched = join?.unmatched ?? [];
  const metaBase: OptionObject = { geoLayer: layerId, mark, unmatched, matched: join ? join.byLabel.size : 0, nameProperty: join?.prop ?? null };

  if (fill) {
    if (!areaAt || !join) throw new Error(`${spec.chartType}: fill marks need a region field (zone, state, county, country); use symbol marks for latitude/longitude`);
    const seen = new Map<string, { name: string; value: number | null; label: string }>();
    for (let i = 0; i < n; i++) {
      const label = String(areaAt(i));
      const f = join.byLabel.get(label);
      if (!f || seen.has(label)) continue;
      seen.set(label, { name: featureKey(f, join.prop), value: vm ? measureAt(vm, i) : null, label });
    }
    const data = [...seen.values()];
    const finiteVals = data.map((d) => d.value).filter((v): v is number => v !== null);
    const hasColor = Boolean(vm) && finiteVals.length > 0 && mark === 'fill';
    const showLabels = mark === 'label' || spec.marks.labels.show;
    const series: OptionObject = {
      type: 'map', map: layerId, nameProperty: join.prop, roam: true, zoom: 1.05, selectedMode: false,
      data: data.map((d) => ({ name: d.name, value: d.value ?? undefined, label_: d.label })),
      itemStyle: { areaColor: theme.grid, borderColor: theme.bg, borderWidth: 1, opacity: spec.marks.opacity },
      emphasis: { itemStyle: { borderColor: theme.navy, borderWidth: 1.5 }, label: { show: showLabels } },
      label: {
        show: showLabels, color: theme.text, fontSize: fonts.label, fontFamily: fonts.labels,
        formatter: (p: { name: string; data?: { label_?: string; value?: number } }) => {
          const name = p.data?.label_ ?? p.name;
          const v = p.data?.value;
          return v === undefined || v === null || Number.isNaN(v) || !colorM ? name : `${name}\n${fmt(v)}`;
        },
      },
    };
    return {
      ...base,
      tooltip: tooltip(ctx, 'item', (params: unknown) => {
        const p = params as { name: string; data?: { label_?: string; value?: number } };
        const name = p.data?.label_ ?? p.name;
        const v = p.data?.value;
        const rows = colorM && v !== undefined && !Number.isNaN(Number(v)) ? tooltipRow(pillLabel(colorM), fmt(Number(v))) : `<div style="color:${theme.textMuted}">${p.data ? 'no value' : 'no data'}</div>`;
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(name)}</div>${rows}`;
      }),
      ...(hasColor ? { visualMap: visualMap(ctx, Math.min(...finiteVals), Math.max(...finiteVals), fmt) } : {}),
      series: [series],
      __meta: { ...metaBase, regions: data.length, colorMeasure: colorM ? pillLabel(colorM) : null },
    };
  }

  // Point marks: symbol / bubble / heat.
  const rows: MapPoint[] = [];
  const shapeLabels: string[] = [];
  let unplaced = 0;
  for (let i = 0; i < n; i++) {
    const { pos, label } = positionOf(i);
    if (!pos) { unplaced++; continue; }
    const shape = shapeAt ? String(shapeAt(i)) : '';
    if (shapeAt && !shapeLabels.includes(shape)) shapeLabels.push(shape);
    rows.push({
      pos, label: labelAt ? String(labelAt(i)) : label, value: vm ? measureAt(vm, i) : null, size: sm ? measureAt(sm, i) : null,
      color: colorAt ? String(colorAt(i)) : (colorM ? pillLabel(colorM) : 'Locations'), shape,
    });
  }
  const shapes = shapeAt ? shapeMap(ctx, shapeLabels) : undefined;
  const sizeSource = sm ? rows.map((r) => r.size) : rows.map((r) => r.value);
  const scale = sizeScale(sizeSource, spec.marks.sizeRange);
  const baseSize = shapes ? shapes.size : Math.max(spec.marks.sizeRange[0], 8);
  const continuousColor = Boolean(vm) && !colorAt;
  const finiteVals = rows.map((r) => r.value).filter((v): v is number => v !== null);

  if (mark === 'heat') {
    const data = rows.filter((r) => r.value !== null).map((r) => [r.pos[0], r.pos[1], r.value as number]);
    return {
      ...base,
      geo: geoBase,
      tooltip: tooltip(ctx, 'item', (params: unknown) => { const p = params as { value: [number, number, number] }; return tooltipRow(colorM ? pillLabel(colorM) : 'value', fmt(p.value[2])); }),
      ...(finiteVals.length ? { visualMap: visualMap(ctx, Math.min(...finiteVals), Math.max(...finiteVals), fmt) } : {}),
      series: [{ type: 'heatmap', coordinateSystem: 'geo', data, pointSize: 20, blurSize: 30 }],
      __meta: { ...metaBase, points: data.length, unplaced },
    };
  }

  // Group into series: by the Color dimension, else by Shape label (so the legend can show icons), else one series.
  const groupKey = colorAt ? (r: MapPoint) => r.color : shapes ? (r: MapPoint) => r.shape : (r: MapPoint) => r.color;
  const groups = new Map<string, MapPoint[]>();
  const order = colorAt ? seriesOrder(ctx) : undefined;
  if (order) for (const name of order) groups.set(name, []);
  for (const r of rows) { const k = groupKey(r); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  for (const [k, v] of [...groups]) if (v.length === 0) groups.delete(k);
  const names = [...groups.keys()];
  const colors = colorAt ? seriesColors(ctx, names) : names.map(() => seriesColors(ctx, [names[0] ?? ''])[0]!);
  const ripple = spec.marks.extra.ripple === true;
  const series = names.map((name, si) => {
    const pts = groups.get(name)!;
    /** `[lon, lat, value, label, sizeValue, shapeLabel]` */
    const data = pts.map((r) => [r.pos[0], r.pos[1], r.value ?? NaN, r.label, r.size, r.shape]);
    const s: OptionObject = {
      type: ripple ? 'effectScatter' : 'scatter',
      name,
      coordinateSystem: 'geo',
      data,
      symbol: shapes ? (colorAt ? (_v: unknown, p: { data: unknown[] }) => shapes.symbolOf(String(p.data[5] ?? '')) : shapes.symbolOf(name)) : 'circle',
      symbolSize: mark === 'bubble' ? (d: unknown[]) => scale(sm ? (d[4] as number | null) : (Number.isNaN(d[2] as number) ? null : (d[2] as number))) : baseSize,
      itemStyle: { color: colors[si] ?? theme.border, opacity: mark === 'bubble' ? Math.min(spec.marks.opacity, 0.75) : spec.marks.opacity, borderColor: theme.bg, borderWidth: 1 },
      emphasis: { scale: 1.3 },
      label: { show: spec.marks.labels.show, position: 'top', color: theme.text, fontSize: fonts.label, fontFamily: fonts.labels, formatter: (p: { value: unknown[] }) => String(p.value[3] ?? '') },
      z: 3,
    };
    if (ripple) s.rippleEffect = { scale: 2.5, brushType: 'stroke' };
    return s;
  });
  return {
    ...base,
    geo: geoBase,
    tooltip: tooltip(ctx, 'item', (params: unknown) => {
      const p = params as { seriesName: string; value: unknown[]; color: string };
      const label = String(p.value[3] ?? '') || p.seriesName;
      const lines: string[] = [];
      const v = p.value[2] as number;
      if (colorM && !Number.isNaN(v)) lines.push(tooltipRow(pillLabel(colorM), fmt(v)));
      if (sizeM && p.value[4] !== null && p.value[4] !== undefined) lines.push(tooltipRow(pillLabel(sizeM), sizeFmt(p.value[4] as number)));
      if (colorAt && p.seriesName !== label) lines.push(tooltipRow(pillLabel(colorDim!), p.seriesName, p.color));
      return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(label)}</div>${lines.join('')}`;
    }),
    legend: legend(ctx, names, shapes && !colorAt ? shapes.legendIcons : undefined),
    ...(continuousColor && finiteVals.length ? { visualMap: { ...visualMap(ctx, Math.min(...finiteVals), Math.max(...finiteVals), fmt), seriesIndex: names.map((_, i) => i), dimension: 2 } } : {}),
    series,
    __meta: { ...metaBase, points: rows.length, unplaced, seriesCount: names.length, shapeSet: shapes?.set.id ?? null, latLon: Boolean(latM && lonM) },
  };
}
