/**
 * Bullet (CHARTS.md #23): always horizontal; fixed gray bands at 60/80/100 %
 * of the target (or of the max when none) + the measure bar + a target
 * tick from the second M.
 */
import type { ChartDef } from '../registry';
import {
  baseOption, categoryAxis, classify, dimsOn, escapeHtml, formatterFor, gridBox, measuresOn, labelsAndValues, pointCount, requireMeasure, seriesLabel, svgIcon,
  themeOf, tooltip, tooltipRow, valueAxis,
} from '../option-common';
import { bands, measureCells } from '../transforms';

export const bullet: ChartDef = {
  id: 'bullet',
  label: 'Bullet',
  group: 'comparison',
  icon: svgIcon('<rect x="3" y="6" width="18" height="4" rx="1" fill="currentColor" fill-opacity="0.15"/><rect x="3" y="7" width="12" height="2" fill="currentColor"/><path d="M17 5v6"/><rect x="3" y="14" width="18" height="4" rx="1" fill="currentColor" fill-opacity="0.15"/><rect x="3" y="15" width="8" height="2" fill="currentColor"/><path d="M14 13v6"/>'),
  requires: { dims: [1, 1], measures: [1, 2] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'ScatterChart', 'GridComponent', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const dPill = dimsOn(spec, 'columns')[0] ?? dimsOn(spec, 'rows')[0] ?? classify(spec).dims[0];
    const ms = [...measuresOn(spec, 'rows'), ...measuresOn(spec, 'columns'), ...classify(spec).measures];
    const mPill = ms[0];
    const tPill = ms.find((m) => m.id !== mPill?.id);
    if (!mPill) throw new Error('bullet: needs a measure');
    const { labels, values } = labelsAndValues(ctx, dPill, mPill);
    const n = labels.length;
    const targets = tPill ? measureCells(requireMeasure(ctx, tPill, 'the target'), n) : values.map(() => null);
    const maxValue = Math.max(0, ...values.map((v) => v ?? 0), ...targets.map((v) => v ?? 0));
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    const grays = [theme.border, theme.borderLight, theme.grid];
    const bandRows = labels.map((_, i) => bands(targets[i] ?? maxValue));
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'axis', (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex: number }>;
        const i = list[0]?.dataIndex ?? 0;
        const t = targets[i];
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(labels[i] ?? '')}</div>${tooltipRow('Value', fmt(values[i] ?? 0), theme.navy)}${t !== null && t !== undefined ? tooltipRow('Target', fmt(t), theme.text) : ''}`;
      }),
      grid: gridBox(ctx, 1),
      xAxis: valueAxis(ctx, 'x', mPill, { max: Math.max(maxValue, ...bandRows.map((b) => b[2])) || undefined }),
      yAxis: { ...categoryAxis(ctx, 'y', dPill, labels), inverse: !spec.axes.y.reversed },
      series: [
        ...[2, 1, 0].map((bi) => ({ type: 'bar', name: `band-${bi}`, silent: true, barGap: '-100%', barMaxWidth: 28, z: 1, data: bandRows.map((b) => b[bi]), itemStyle: { color: grays[2 - bi] } })),
        {
          type: 'bar', name: 'value', barGap: '-100%', barMaxWidth: 10, z: 2, data: values,
          itemStyle: { color: theme.navy, opacity: spec.marks.opacity },
          label: seriesLabel(ctx, fmt, 'right'),
        },
        // The target tick: a thin rectangle at [target, row] on the same axes.
        { type: 'scatter', name: 'target', silent: true, z: 3, symbol: 'rect', symbolSize: [3, 22], data: targets.map((t, i) => (t === null ? null : [t, i])), itemStyle: { color: theme.text } },
      ],
      __meta: { hasTarget: Boolean(tPill), rows: n },
    };
  },
};
