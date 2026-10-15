/**
 * KPI tile (CHARTS.md #32, DOM renderer): one M formatted by its FormatSpec; a
 * second M (Tooltip/Label) is shown as a delta colored by sign. `build`
 * returns the model `KpiTile.svelte` renders.
 */
import type { ChartDef } from '../registry';
import { classify, formatterFor, pillLabel, requireMeasure, svgIcon } from '../option-common';
import { measureAt } from '../transforms';

/** The DOM model. */
export interface KpiModel {
  renderer: 'dom';
  kind: 'kpi';
  label: string;
  value: string;
  /** Secondary measure as a signed delta; `sign` drives the color token. */
  delta?: { label: string; text: string; sign: 'positive' | 'negative' | 'zero' };
}

export const kpi: ChartDef = {
  id: 'kpi',
  label: 'KPI tile',
  group: 'table',
  icon: svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 14h4M7 11h10"/>'),
  requires: { dims: [0, 0], measures: [1, 2] },
  channels: ['label', 'tooltip'],
  renderer: 'dom',
  echartsModules: [],
  build: (ctx) => {
    const spec = ctx.spec;
    const all = [...classify(spec).measures, ...spec.shelves.tooltip.filter((p) => p.role === 'measure')].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    const [mPill, dPill] = all;
    const m = requireMeasure(ctx, mPill, 'the measure');
    const v = measureAt(m, 0);
    const fmt = formatterFor(ctx, mPill);
    const model: KpiModel = { renderer: 'dom', kind: 'kpi', label: pillLabel(mPill!), value: v === null ? '—' : fmt(v) };
    if (dPill) {
      const dm = requireMeasure(ctx, dPill, 'the delta');
      const dv = measureAt(dm, 0);
      if (dv !== null) {
        const dfmt = formatterFor(ctx, dPill);
        model.delta = { label: pillLabel(dPill), text: `${dv > 0 ? '+' : ''}${dfmt(dv)}`, sign: dv > 0 ? 'positive' : dv < 0 ? 'negative' : 'zero' };
      }
    }
    return model as unknown as Record<string, unknown>;
  },
};
