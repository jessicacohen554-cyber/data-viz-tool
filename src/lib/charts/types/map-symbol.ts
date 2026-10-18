/**
 * Symbol map (CHARTS.md #39, D-13/D-17): points on a geo base from
 * latitude + longitude measures, or at the centroids of matched regions when
 * only an area-role dimension is present. Size by Size, color by Color
 * (dimension → series, measure → gradient), shape by Shape via the icon sets;
 * `marks.mapMark` picks `symbol` (default), `bubble` or `heat`;
 * `marks.extra.ripple` draws `effectScatter`.
 */
import type { ChartDef } from '../registry';
import { buildMap, mapUnmet } from '../map-common';
import { svgIcon } from '../option-common';

export const mapSymbol: ChartDef = {
  id: 'map-symbol',
  label: 'Symbol map',
  group: 'relationship',
  icon: svgIcon('<path d="M4 6l5-2 4 3 7-2v11l-6 3-5-2-5 3z" fill="currentColor" fill-opacity="0.12"/><circle cx="9" cy="10" r="2" fill="currentColor"/><circle cx="15" cy="13" r="2.8" fill="currentColor"/><circle cx="12" cy="17" r="1.4" fill="currentColor"/>'),
  requires: { dims: [0, 4], measures: [0, 5], exact: (spec, meta) => mapUnmet(spec, meta, false) },
  channels: ['color', 'size', 'shape', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  needs: { disaggregate: true },
  echartsModules: ['ScatterChart', 'EffectScatterChart', 'HeatmapChart', 'GeoComponent', 'TooltipComponent', 'LegendComponent', 'VisualMapComponent', 'CanvasRenderer'],
  build: (ctx) => buildMap(ctx, ctx.spec.shelves.size[0] ? 'bubble' : 'symbol'),
};
