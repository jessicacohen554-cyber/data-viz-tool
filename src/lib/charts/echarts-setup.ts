/**
 * ECharts, tree-shaken (D-1): `echarts/core` plus exactly the modules the
 * chart registry declares in `ChartDef.echartsModules`, and the
 * `CanvasRenderer`. `REGISTERED_MODULES` names what is installed so a test
 * can cross-check it against the registry. Framework-free and DOM-free at
 * import time (rule R-PURE); only `lib/ui/chart/ChartCanvas.svelte` calls `init`.
 *
 * v2 adds the map stack (`MapChart`, `EffectScatterChart`, `GeoComponent`),
 * the mark components reference lines, bands and annotations draw with, and
 * `TitleComponent` for the style panel's title/subtitle.
 */
import * as echarts from 'echarts/core';
import {
  BarChart, BoxplotChart, CandlestickChart, CustomChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart, LineChart,
  MapChart, ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreemapChart,
} from 'echarts/charts';
import {
  CalendarComponent, DataZoomInsideComponent, GeoComponent, GraphicComponent, GridComponent, LegendComponent,
  MarkAreaComponent, MarkLineComponent, MarkPointComponent, ParallelComponent, RadarComponent, SingleAxisComponent,
  TitleComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

/** Installers by their export name (the names `ChartDef.echartsModules` uses). */
const MODULES = {
  BarChart, BoxplotChart, CandlestickChart, CustomChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart, LineChart,
  MapChart, ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreemapChart,
  CalendarComponent, DataZoomInsideComponent, GeoComponent, GraphicComponent, GridComponent, LegendComponent,
  MarkAreaComponent, MarkLineComponent, MarkPointComponent, ParallelComponent, RadarComponent, SingleAxisComponent,
  TitleComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, CanvasRenderer,
} as const;

/** Names of every installed module, sorted. */
export const REGISTERED_MODULES: readonly string[] = Object.keys(MODULES).sort();

echarts.use(Object.values(MODULES));

export { echarts };

/** An initialised chart instance (what `ChartCanvas` holds). */
export type EChartsInstance = ReturnType<typeof echarts.init>;
