/**
 * Box plot (CHARTS.md #21): statistics come from the worker
 * (`QueryResult.boxstats`: q1, median, q3, whiskers at 1.5·IQR, outliers);
 * one box per D value on Columns, or a single box. Outliers above 1K per box
 * are sampled and the tooltip says so.
 */
import type { ChartDef } from '../registry';
import {
  baseOption, categoryAxis, dimFormatter, dimsOn, escapeHtml, formatterFor, gridBox, measuresOn, pillLabel, pointCount, requireDim, svgIcon, themeOf,
  tooltip, tooltipRow, valueAxis, classify,
} from '../option-common';
import { dimAccessor } from '../transforms';

/** Outliers kept per box before sampling. */
export const MAX_OUTLIERS_PER_BOX = 1000;

export const boxplot: ChartDef = {
  id: 'boxplot',
  label: 'Box plot',
  group: 'distribution',
  icon: svgIcon('<path d="M8 4v3M8 17v3M5 7h6M5 20h6"/><rect x="5" y="9" width="6" height="7"/><path d="M5 12.5h6M16 6v2M16 16v2M13 8h6M13 18h6"/><rect x="13" y="10" width="6" height="6"/>'),
  requires: { dims: [0, 1], measures: [1, 1] },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  needs: { boxstats: true },
  echartsModules: ['BoxplotChart', 'ScatterChart', 'GridComponent', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const stats = ctx.result.boxstats;
    if (!stats) throw new Error('boxplot: the result carries no box statistics (query needs `boxstats`)');
    const dPill = dimsOn(spec, 'columns')[0] ?? classify(spec).dims[0];
    const mPill = measuresOn(spec, 'rows')[0] ?? classify(spec).measures[0];
    const n = stats.med.length;
    const dim = dPill ? requireDim(ctx, dPill, 'Columns') : undefined;
    const at = dim ? dimAccessor(dim) : () => pillLabel(mPill!);
    const dFmt = dimFormatter(ctx, dPill);
    const labels: string[] = [];
    const boxes: Array<[number, number, number, number, number]> = [];
    const outliers: Array<[number, number]> = [];
    let sampled = 0;
    for (let i = 0; i < n; i++) {
      labels.push(dFmt(at(i)));
      boxes.push([stats.lo[i] ?? NaN, stats.q1[i] ?? NaN, stats.med[i] ?? NaN, stats.q3[i] ?? NaN, stats.hi[i] ?? NaN]);
      const o = stats.outliers[i] ?? new Float64Array(0);
      const step = o.length > MAX_OUTLIERS_PER_BOX ? o.length / MAX_OUTLIERS_PER_BOX : 1;
      if (step > 1) sampled++;
      for (let k = 0; k < o.length; k += step) { const v = o[Math.floor(k)]; if (v !== undefined && !Number.isNaN(v)) outliers.push([i, v]); }
    }
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    return {
      ...baseOption(ctx, pointCount(ctx) + outliers.length),
      tooltip: tooltip(ctx, 'item', (params: unknown) => {
        const p = params as { seriesType: string; name: string; value: number[]; dataIndex: number };
        if (p.seriesType === 'scatter') return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(labels[p.value[0] ?? 0] ?? '')}</div>${tooltipRow('Outlier', fmt(p.value[1] ?? 0))}`;
        const [lo, q1, med, q3, hi] = p.value.slice(1) as number[];
        const note = sampled > 0 ? `<div style="color:${theme.textMuted};margin-top:4px">outliers sampled</div>` : '';
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(p.name)}</div>${tooltipRow('Upper whisker', fmt(hi ?? 0))}${tooltipRow('Q3', fmt(q3 ?? 0))}${tooltipRow('Median', fmt(med ?? 0))}${tooltipRow('Q1', fmt(q1 ?? 0))}${tooltipRow('Lower whisker', fmt(lo ?? 0))}${note}`;
      }),
      grid: gridBox(ctx, 1),
      xAxis: categoryAxis(ctx, 'x', dPill, labels),
      yAxis: valueAxis(ctx, 'y', mPill, { scale: true }),
      series: [
        { type: 'boxplot', name: pillLabel(mPill!), data: boxes, boxWidth: [8, 40], itemStyle: { color: theme.bg, borderColor: theme.accent, borderWidth: 1.5 }, emphasis: { itemStyle: { borderColor: theme.navy } } },
        { type: 'scatter', name: 'Outliers', data: outliers, symbolSize: 5, itemStyle: { color: theme.tick, opacity: 0.7 }, large: outliers.length > 2000 },
      ],
      __meta: { boxes: n, outliers: outliers.length, sampledBoxes: sampled },
    };
  },
};
