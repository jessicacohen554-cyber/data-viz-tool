/**
 * The chart registry (docs/CHARTS.md): one `ChartDef` per id in
 * `CHART_TYPE_IDS`, the picker's group order, and the plan features a chart
 * needs from the worker. The `ChartDef` / `Requirement` / `BuildContext`
 * shapes are frozen (S0); `BuildContext.theme` is an additive optional field
 * the canvas fills with live CSS token values. Framework-free (rule R-PURE).
 */
import type { ChartTypeId, FieldMeta, QueryResult, ShelfId, VizSpec } from '../core/types';
import { CHART_TYPE_IDS } from '../core/constants';
import type { ChartNeeds } from '../core/query-of';
import type { ChartTheme } from './option-common';
import { classify } from './option-common';

import { bar } from './types/bar';
import { barH } from './types/bar-h';
import { barGrouped } from './types/bar-grouped';
import { barStacked } from './types/bar-stacked';
import { barStacked100 } from './types/bar-stacked-100';
import { line } from './types/line';
import { area } from './types/area';
import { areaStacked } from './types/area-stacked';
import { area100 } from './types/area-100';
import { combo } from './types/combo';
import { streamgraph } from './types/streamgraph';
import { scatter } from './types/scatter';
import { bubble } from './types/bubble';
import { pie } from './types/pie';
import { donut } from './types/donut';
import { funnel } from './types/funnel';
import { gauge } from './types/gauge';
import { treemap } from './types/treemap';
import { sunburst } from './types/sunburst';
import { heatmap } from './types/heatmap';
import { calendarHeatmap } from './types/calendar-heatmap';
import { highlightTable } from './types/highlight-table';
import { histogram } from './types/histogram';
import { boxplot } from './types/boxplot';
import { envelope } from './types/envelope';
import { waterfall } from './types/waterfall';
import { bullet } from './types/bullet';
import { lollipop } from './types/lollipop';
import { dumbbell } from './types/dumbbell';
import { radar } from './types/radar';
import { parallel } from './types/parallel';
import { sankey } from './types/sankey';
import { slope } from './types/slope';
import { bump } from './types/bump';
import { candlestick } from './types/candlestick';
import { mapChoropleth } from './types/map-choropleth';
import { mapSymbol } from './types/map-symbol';
import { kpi } from './types/kpi';
import { textTable } from './types/text-table';

/** Shelf requirements evaluated by show-me.ts. */
export interface Requirement {
  dims: [min: number, max: number];
  measures: [min: number, max: number];
  dates?: [min: number, max: number];
  colorDim?: boolean;
  /** Extra check returning a reason string when not satisfied. */
  exact?: (spec: VizSpec, meta: FieldMeta[]) => string | null;
}

/** Context handed to a chart's option builder. */
export interface BuildContext {
  spec: VizSpec;
  result: QueryResult;
  meta: FieldMeta[];
  isMobile: boolean;
  /** Live CSS token values from the canvas; builders fall back to `DEFAULT_THEME`. */
  theme?: ChartTheme;
}

/** One chart type. */
export interface ChartDef {
  id: ChartTypeId;
  label: string;
  group: 'comparison' | 'trend' | 'distribution' | 'part-to-whole' | 'relationship' | 'flow' | 'table';
  /** Inline SVG icon markup. */
  icon: string;
  requires: Requirement;
  /** Marks-card shelves this chart honours. */
  channels: ShelfId[];
  renderer: 'echarts' | 'dom';
  needs?: ChartNeeds;
  /** ECharts modules this chart needs registered (cross-checked against echarts-setup.ts by a test). */
  echartsModules: string[];
  /** Pure: spec + result → ECharts option (or a model record for `dom` renderers). */
  build: (ctx: BuildContext) => Record<string, unknown>;
}

const DEFS: readonly ChartDef[] = [
  bar, barH, barGrouped, barStacked, barStacked100,
  line, area, areaStacked, area100, combo, streamgraph,
  scatter, bubble,
  pie, donut, funnel, gauge,
  treemap, sunburst,
  heatmap, calendarHeatmap, highlightTable,
  histogram, boxplot, envelope,
  waterfall, bullet, lollipop, dumbbell,
  radar, parallel, sankey,
  slope, bump,
  candlestick,
  mapChoropleth, mapSymbol,
  kpi, textTable,
];

/**
 * Modules the style pass (`style.ts`) may add to any ECharts option: the
 * title/subtitle component and the graphic caption. Required for every
 * ECharts type, so they are declared once here rather than on each def.
 */
export const STYLE_MODULES: readonly string[] = ['TitleComponent', 'GraphicComponent'];

/** The registry: every id in `CHART_TYPE_IDS`. */
export const CHART_TYPES: Partial<Record<ChartTypeId, ChartDef>> = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Partial<Record<ChartTypeId, ChartDef>>;

/** Definition for an id; throws for an unknown id (the contract guarantees coverage). */
export function chartDef(id: ChartTypeId): ChartDef {
  const d = CHART_TYPES[id];
  if (!d) throw new Error(`chart type "${id}" is not registered`);
  return d;
}

/** Picker groups in docs/CHARTS.md order (finer than `ChartDef.group`). */
export const PICKER_GROUPS: ReadonlyArray<{ label: string; ids: readonly ChartTypeId[] }> = [
  { label: 'Bars', ids: ['bar', 'bar-h', 'bar-grouped', 'bar-stacked', 'bar-stacked-100'] },
  { label: 'Lines', ids: ['line', 'area', 'area-stacked', 'area-100', 'combo', 'streamgraph'] },
  { label: 'Points', ids: ['scatter', 'bubble'] },
  { label: 'Parts of whole', ids: ['pie', 'donut', 'funnel', 'gauge'] },
  { label: 'Hierarchy', ids: ['treemap', 'sunburst'] },
  { label: 'Grid', ids: ['heatmap', 'calendar-heatmap', 'highlight-table'] },
  { label: 'Distribution', ids: ['histogram', 'boxplot', 'envelope'] },
  { label: 'Comparison', ids: ['waterfall', 'bullet', 'lollipop', 'dumbbell'] },
  { label: 'Multivariate', ids: ['radar', 'parallel'] },
  { label: 'Flow', ids: ['sankey'] },
  { label: 'Rank / change', ids: ['slope', 'bump'] },
  { label: 'Finance', ids: ['candlestick'] },
  { label: 'Maps', ids: ['map-choropleth', 'map-symbol'] },
  { label: 'Text', ids: ['kpi', 'text-table'] },
];

/**
 * Plan features for the spec's chart type, refined by the pills: scatter,
 * bubble, parallel and the symbol map disaggregate only when no dimension
 * groups the marks (CHARTS.md #9, #27, #39); boxplot always asks for box statistics.
 */
export function needsFor(spec: VizSpec): ChartNeeds {
  const def = CHART_TYPES[spec.chartType];
  const needs: ChartNeeds = { ...(def?.needs ?? {}) };
  if (needs.disaggregate && classify(spec).dims.length > 0) delete needs.disaggregate;
  return needs;
}

/** Every module name any ChartDef lists plus `STYLE_MODULES`, deduplicated and sorted (what `echarts-setup.ts` must register). */
export function requiredEchartsModules(): string[] {
  return [...new Set([...DEFS.flatMap((d) => d.echartsModules), ...STYLE_MODULES])].sort();
}

/** Ids missing from the registry (empty when the contract is met). */
export function unregisteredIds(): ChartTypeId[] {
  return CHART_TYPE_IDS.filter((id) => !CHART_TYPES[id]);
}
