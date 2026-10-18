/**
 * Choropleth map (CHARTS.md #38, D-13): regions of a GeoJSON layer filled
 * from a measure. Needs a dimension with an area geo role (country, US state,
 * US county, ERCOT zone) or an explicit `spec.geoLayer`. `marks.mapMark`
 * switches to `label` (names) or the point marks of `map-symbol`.
 */
import type { ChartDef } from '../registry';
import { buildMap, mapUnmet } from '../map-common';
import { svgIcon } from '../option-common';

export const mapChoropleth: ChartDef = {
  id: 'map-choropleth',
  label: 'Filled map',
  group: 'relationship',
  icon: svgIcon('<path d="M4 6l5-2 4 3 7-2v11l-6 3-5-2-5 3z" fill="currentColor" fill-opacity="0.2"/><path d="M9 4v13M13 7v10"/>'),
  requires: { dims: [1, 3], measures: [0, 3], exact: (spec, meta) => mapUnmet(spec, meta, false) },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['MapChart', 'GeoComponent', 'TooltipComponent', 'LegendComponent', 'VisualMapComponent', 'CanvasRenderer'],
  build: (ctx) => buildMap(ctx, 'fill'),
};
