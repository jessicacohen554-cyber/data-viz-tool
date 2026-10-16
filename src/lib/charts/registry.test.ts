import { describe, expect, it } from 'vitest';
import { CHART_TYPE_IDS, PENDING_CHART_TYPE_IDS } from '../core/constants';
import { CHART_TYPES, PICKER_GROUPS, chartDef, needsFor, unregisteredIds } from './registry';
import { makeSpec, dim, measure } from './test-fixtures';

describe('chart registry', () => {
  it('registers every id in CHART_TYPE_IDS, and nothing else; no id is left pending (v2 complete)', () => {
    expect(unregisteredIds()).toEqual([]);
    expect(PENDING_CHART_TYPE_IDS).toEqual([]);
    expect(CHART_TYPE_IDS).toHaveLength(39);
    expect(Object.keys(CHART_TYPES).sort()).toEqual([...CHART_TYPE_IDS].sort());
    for (const id of CHART_TYPE_IDS) expect(chartDef(id).id).toBe(id);
  });

  it('every definition carries a label, an inline SVG icon, channels and a renderer', () => {
    for (const id of CHART_TYPE_IDS) {
      const d = chartDef(id);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.icon.startsWith('<svg')).toBe(true);
      expect(['echarts', 'dom']).toContain(d.renderer);
      if (d.renderer === 'echarts') expect(d.echartsModules).toContain('CanvasRenderer');
      else expect(d.echartsModules).toEqual([]);
      expect(d.channels).toContain('tooltip');
    }
  });

  it('DOM renderers are exactly kpi, text-table and highlight-table', () => {
    const dom = CHART_TYPE_IDS.filter((id) => chartDef(id).renderer === 'dom').sort();
    expect(dom).toEqual(['highlight-table', 'kpi', 'text-table']);
  });

  it('the picker groups list every id exactly once in CHARTS.md order', () => {
    const ids = PICKER_GROUPS.flatMap((g) => g.ids);
    expect([...ids].sort()).toEqual([...CHART_TYPE_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(PICKER_GROUPS[0]!.label).toBe('Bars');
    expect(PICKER_GROUPS[PICKER_GROUPS.length - 1]!.label).toBe('Text');
  });

  it('needsFor: scatter disaggregates only without a grouping dimension; boxplot asks for boxstats', () => {
    expect(needsFor(makeSpec('scatter', { columns: [measure('a')], rows: [measure('b')] }))).toEqual({ disaggregate: true });
    expect(needsFor(makeSpec('scatter', { columns: [measure('a')], rows: [measure('b')], detail: [dim('zone')] }))).toEqual({});
    expect(needsFor(makeSpec('boxplot', { columns: [dim('zone')], rows: [measure('p', 'none')] }))).toEqual({ boxstats: true });
    expect(needsFor(makeSpec('bar', { columns: [dim('zone')], rows: [measure('p')] }))).toEqual({});
  });
});
