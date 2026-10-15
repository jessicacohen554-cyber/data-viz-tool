/**
 * `buildOption(ctx)`: VizSpec + QueryResult → ECharts option (or a DOM model
 * for `renderer: 'dom'` types) by dispatching to the registered `ChartDef`.
 * Pure (rule R-PURE); the canvas owns `setOption`. `BuildOutcome` wraps the
 * result so a builder error is reported, not thrown into the UI.
 */
import type { ChartTypeId } from '../core/types';
import { type BuildContext, chartDef } from './registry';

/** Result of a build: an option, or the reason it failed. */
export type BuildOutcome =
  | { ok: true; renderer: 'echarts' | 'dom'; option: Record<string, unknown> }
  | { ok: false; renderer: 'echarts' | 'dom'; error: string };

/** Build the option for `ctx.spec.chartType`; throws for an unregistered id. */
export function buildOption(ctx: BuildContext): Record<string, unknown> {
  return chartDef(ctx.spec.chartType).build(ctx);
}

/** `buildOption` that reports instead of throwing. */
export function tryBuildOption(ctx: BuildContext): BuildOutcome {
  const def = chartDef(ctx.spec.chartType);
  try {
    return { ok: true, renderer: def.renderer, option: def.build(ctx) };
  } catch (e) {
    return { ok: false, renderer: def.renderer, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Renderer of a chart id. */
export function rendererOf(id: ChartTypeId): 'echarts' | 'dom' {
  return chartDef(id).renderer;
}

/** Keys replaced wholesale on `setOption` so removed series/axes never linger. */
export const REPLACE_MERGE_KEYS: readonly string[] = ['series', 'xAxis', 'yAxis', 'visualMap', 'dataZoom', 'legend', 'radar', 'parallelAxis', 'calendar', 'singleAxis'];
