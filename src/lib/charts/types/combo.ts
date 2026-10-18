/**
 * Combo (CHARTS.md #36, D-19): bars and lines/areas on two value axes. Every
 * measure on Rows is a series; `Pill.axis` chooses its axis, and a measure
 * without one goes primary when it is the first and secondary otherwise.
 * `marks.markByAxis` picks the mark per axis (default bar left, line right).
 */
import type { BuildContext, ChartDef } from '../registry';
import {
  type OptionObject, DECORATION_MODULES, applyNullHandling, axisKind, axisTooltipFormatter, baseOption, cartesianModel, categoryAxis, cellData,
  decorationsFor, dimFormatter, formatterFor, gridBox, legend, pillLabel, pointCount, seriesColors, seriesLabel, svgIcon, themeOf, timeAxis, tooltip,
  valueAxes, valueAxis,
} from '../option-common';
import { applyDecorations } from '../decorations';

/** Default marks per axis. */
export const DEFAULT_MARK_BY_AXIS = { primary: 'bar', secondary: 'line' } as const;

/** Build the combo option. */
export function buildCombo(ctx: BuildContext): OptionObject {
  const spec = ctx.spec;
  const model = cartesianModel(ctx, { secondaryFrom: 1 });
  const markBy = spec.marks.markByAxis ?? DEFAULT_MARK_BY_AXIS;
  const names = model.series.map((s) => s.name);
  const colors = seriesColors(ctx, names);
  const theme = themeOf(ctx);
  const fmts = model.series.map((s) => formatterFor(ctx, s.pill));
  const kind = axisKind(model.xPill);
  const xKind = kind === 'time' ? 'time' : 'category';
  const points = pointCount(ctx, model.series.length);
  const marks = spec.marks;
  const series: OptionObject[] = model.series.map((s, i) => {
    const mark = markBy[s.axis];
    const color = colors[i] ?? theme.border;
    const common: OptionObject = { name: s.name, yAxisIndex: s.axis === 'secondary' ? 1 : 0, emphasis: { focus: 'series' }, label: seriesLabel(ctx, fmts[i]!, 'top') };
    if (mark === 'bar') {
      return {
        ...common, type: 'bar', data: s.values.map(cellData), barMaxWidth: 48, barGap: '10%', barCategoryGap: `${Math.round(marks.barGap * 100)}%`,
        itemStyle: { color, opacity: marks.opacity, borderRadius: [4, 4, 0, 0] },
      };
    }
    const data = applyNullHandling(s.values, marks.nullHandling);
    const line: OptionObject = {
      ...common, type: 'line', data: xKind === 'time' ? data.map((v, xi) => [model.x[xi], v]) : data, smooth: marks.smooth, showSymbol: marks.showPoints || mark === 'line',
      symbol: 'circle', symbolSize: 7, connectNulls: marks.nullHandling === 'connect', z: 3,
      lineStyle: { width: marks.lineWidth, color }, itemStyle: { color, borderColor: theme.bg, borderWidth: 2 },
    };
    if (mark === 'area') line.areaStyle = { color, opacity: Math.min(marks.opacity, 0.35) };
    return line;
  });
  const deco = decorationsFor(ctx, model, false, colors, xKind);
  // Bars need a category axis; a trunc date still draws as categories of its formatted labels so bars have width.
  const xAxis = xKind === 'time' && !series.some((s) => s.type === 'bar') ? timeAxis(ctx, 'x', model.xPill) : categoryAxis(ctx, 'x', model.xPill, model.x);
  if (xAxis.type === 'category') for (const s of series) if (s.type === 'line' && Array.isArray(s.data)) s.data = (s.data as unknown[]).map((d) => (Array.isArray(d) ? d[1] : d));
  const yAxes = model.hasSecondary ? valueAxes(ctx, model, false) : [valueAxis(ctx, 'y', model.measures[0])];
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'axis', axisTooltipFormatter(ctx, { xKind: xAxis.type === 'time' ? 'time' : 'category', dimFmt: dimFormatter(ctx, model.xPill), fmtFor: (i) => fmts[i] ?? fmts[0]!, decorations: deco })),
    legend: legend(ctx, names),
    grid: gridBox(ctx, names.length, { right: spec.legend.show && names.length >= 2 && spec.legend.position === 'right' ? 140 : 24 }),
    xAxis,
    yAxis: yAxes.length === 1 ? yAxes[0]! : yAxes,
    series: deco ? applyDecorations(series, deco) : series,
    __meta: {
      seriesCount: names.length, dualAxis: model.hasSecondary, markByAxis: markBy, measures: model.measures.map(pillLabel),
      annotations: deco?.annotations ?? [], ...(deco?.skipped.length ? { notes: deco.skipped } : {}),
    },
  };
}

export const combo: ChartDef = {
  id: 'combo',
  label: 'Combo (bar + line)',
  group: 'trend',
  icon: svgIcon('<rect x="4" y="11" width="3" height="9"/><rect x="10" y="7" width="3" height="13"/><rect x="16" y="13" width="3" height="7"/><path d="M4 8l6-3 6 5 5-4"/>'),
  requires: { dims: [1, 2], measures: [1, 6] },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: buildCombo,
};
