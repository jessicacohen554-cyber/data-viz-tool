/**
 * ECharts, tree-shaken (D-1): `echarts/core` plus exactly the modules the
 * chart registry declares in `ChartDef.echartsModules`, and the
 * `CanvasRenderer`. `REGISTERED_MODULES` names what is installed so a test
 * can cross-check it against the registry. Framework-free and DOM-free at
 * import time (rule R-PURE); only `lib/ui/chart/ChartCanvas.svelte` calls `init`.
 */
import * as echarts from 'echarts/core';
import {
  BarChart, BoxplotChart, CandlestickChart, CustomChart, FunnelChart, GaugeChart, HeatmapChart, LineChart,
  ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreemapChart,
} from 'echarts/charts';
import {
  CalendarComponent, DataZoomInsideComponent, GraphicComponent, GridComponent, LegendComponent, ParallelComponent,
  RadarComponent, SingleAxisComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

/** Installers by their export name (the names `ChartDef.echartsModules` uses). */
const MODULES = {
  BarChart, BoxplotChart, CandlestickChart, CustomChart, FunnelChart, GaugeChart, HeatmapChart, LineChart,
  ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreemapChart,
  CalendarComponent, DataZoomInsideComponent, GraphicComponent, GridComponent, LegendComponent, ParallelComponent,
  RadarComponent, SingleAxisComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, CanvasRenderer,
} as const;

/** Names of every installed module, sorted. */
export const REGISTERED_MODULES: readonly string[] = Object.keys(MODULES).sort();

echarts.use(Object.values(MODULES));

export { echarts };

/** An initialised chart instance (what `ChartCanvas` holds). */
export type EChartsInstance = ReturnType<typeof echarts.init>;
