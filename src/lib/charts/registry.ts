/**
 * STUB (S0) — replaced by shard S3 (docs/CHARTS.md). The `ChartDef` shape is frozen.
 */
import type { ChartTypeId, ShelfId, VizSpec, QueryResult, FieldMeta } from '../core/types';
import type { ChartNeeds } from '../core/query-of';

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
}

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
  /** Pure: spec + result → ECharts option (or an HTMLElement for `dom` renderers). */
  build: (ctx: BuildContext) => Record<string, unknown>;
}

/** The registry; S3 fills it for every id in CHART_TYPE_IDS. */
export const CHART_TYPES: Partial<Record<ChartTypeId, ChartDef>> = {};
