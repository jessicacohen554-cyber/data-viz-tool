/**
 * Calendar (CHARTS.md #18): a `day`-level `trunc` date + 1 M; one calendar per
 * year present; cells keyed `yyyy-MM-dd` in UTC (TABLEAU-SPEC §10: naive
 * values are UTC). Missing days render empty, never zero.
 */
import type { ChartDef } from '../registry';
import { baseOption, classify, escapeHtml, formatterFor, requireDim, requireMeasure, svgIcon, themeOf, tooltip, tooltipRow, visualMap } from '../option-common';
import { dimAccessor, measureAt } from '../transforms';

/** Epoch ms → `yyyy-MM-dd` in UTC. */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const calendarHeatmap: ChartDef = {
  id: 'calendar-heatmap',
  label: 'Calendar',
  group: 'table',
  icon: svgIcon('<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><rect x="7" y="13" width="3" height="3" fill="currentColor"/><rect x="14" y="13" width="3" height="3" fill="currentColor" fill-opacity="0.4"/>'),
  requires: {
    dims: [1, 1], measures: [1, 1], dates: [1, 1],
    exact: (spec) => {
      const t = classify(spec).dates[0];
      return t && t.date && (t.date.level !== 'day' || t.date.mode !== 'trunc') ? 'Needs a continuous date at the Day level' : null;
    },
  },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['HeatmapChart', 'CalendarComponent', 'TooltipComponent', 'VisualMapComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const tPill = c.dates[0];
    const mPill = (spec.shelves.color[0]?.role === 'measure' ? spec.shelves.color[0] : undefined) ?? c.measures[0];
    const tDim = requireDim(ctx, tPill, 'the date');
    const m = requireMeasure(ctx, mPill, 'the measure');
    const at = dimAccessor(tDim);
    const byYear = new Map<number, Array<[string, number]>>();
    let min = Infinity; let max = -Infinity;
    for (let i = 0; i < ctx.result.groups; i++) {
      const t = at(i); const v = measureAt(m, i);
      if (typeof t !== 'number' || !Number.isFinite(t) || v === null) continue;
      const y = new Date(t).getUTCFullYear();
      (byYear.get(y) ?? byYear.set(y, []).get(y)!).push([isoDay(t), v]);
      if (v < min) min = v; if (v > max) max = v;
    }
    if (byYear.size === 0) { min = 0; max = 0; }
    const years = [...byYear.keys()].sort();
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    const legendSpace = spec.legend.show ? 56 : 12;
    const per = (100 - 4) / Math.max(1, years.length);
    const calendars = years.map((y, i) => ({
      range: String(y),
      top: `${6 + i * per}%`,
      height: `${per - 6}%`,
      left: 40, right: 16,
      bottom: i === years.length - 1 ? legendSpace : undefined,
      cellSize: ['auto', 'auto'],
      orient: 'horizontal',
      splitLine: { lineStyle: { color: theme.border, width: 1 } },
      itemStyle: { color: theme.bg, borderColor: theme.borderLight, borderWidth: 1 },
      dayLabel: { color: theme.axisText, fontSize: 10, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
      monthLabel: { color: theme.axisText, fontSize: 10 },
      yearLabel: { show: true, color: theme.textMuted, fontSize: 12, margin: 24 },
    }));
    return {
      ...baseOption(ctx, ctx.result.groups),
      tooltip: tooltip(ctx, 'item', (params: unknown) => { const p = params as { value: [string, number] }; return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(p.value[0])}</div>${tooltipRow(fmt(p.value[1]), '')}`; }),
      visualMap: { ...visualMap(ctx, min, max, fmt), seriesIndex: years.map((_, i) => i), orient: 'horizontal', left: 'center', bottom: 8, right: undefined, top: undefined },
      calendar: calendars,
      series: years.map((y, i) => ({ type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: i, data: byYear.get(y) ?? [], itemStyle: { borderColor: theme.borderLight, borderWidth: 1 } })),
      __meta: { years, min, max },
    };
  },
};
