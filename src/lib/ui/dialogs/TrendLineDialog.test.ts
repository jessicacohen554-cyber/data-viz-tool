// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { TREND_MODELS } from '../../core/constants';
import { createDefaultSpec, defaultTrendLine } from '../../core/spec-defaults';
import { spec } from '../../stores/spec.svelte';
import TrendLineDialog, { DEGREE, MODELS, clampDegree, setModel } from './TrendLineDialog.svelte';
import { byLabel, click, mountComponent, setChecked, setValue, type Mounted } from './mount.test';

describe('TrendLineDialog helpers', () => {
  it('clamps the degree to 2..5 and seeds / drops it with the model', () => {
    expect(clampDegree('3')).toBe(3);
    expect(clampDegree('9')).toBe(DEGREE.max);
    expect(clampDegree('0')).toBe(DEGREE.min);
    expect(clampDegree('x')).toBe(DEGREE.min);
    const t = defaultTrendLine();
    setModel(t, 'poly');
    expect(t).toMatchObject({ model: 'poly', degree: 2 });
    t.degree = 4;
    setModel(t, 'exp');
    expect('degree' in t).toBe(false);
    expect(MODELS).toEqual(TREND_MODELS);
  });
});

describe('TrendLineDialog component', () => {
  let m: Mounted | null = null;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    m = mountComponent(TrendLineDialog, { open: true, onclose: () => {} });
    return () => { m?.unmount(); m = null; };
  });

  it('controls are disabled until enabled; enable round-trips', () => {
    expect((byLabel(m!.root, 'Model') as HTMLSelectElement).disabled).toBe(true);
    setChecked(byLabel(m!.root, 'Show trend line'), true);
    expect(spec.value.trendLine.enabled).toBe(true);
    expect((byLabel(m!.root, 'Model') as HTMLSelectElement).disabled).toBe(false);
  });

  it('model, degree, per-series, equation and color write trendLine', () => {
    setChecked(byLabel(m!.root, 'Show trend line'), true);
    expect(byLabel(m!.root, 'Degree')).toBeUndefined();
    setValue(byLabel(m!.root, 'Model'), 'poly');
    expect(spec.value.trendLine).toMatchObject({ model: 'poly', degree: 2 });
    setValue(byLabel(m!.root, 'Degree'), '7');
    expect(spec.value.trendLine.degree).toBe(5);
    setValue(byLabel(m!.root, 'Model'), 'log');
    expect('degree' in spec.value.trendLine).toBe(false);
    setChecked(byLabel(m!.root, 'One trend line per series'), false);
    setChecked(byLabel(m!.root, 'Show equation'), true);
    expect(spec.value.trendLine).toMatchObject({ perSeries: false, showEquation: true });
    setValue(byLabel(m!.root, 'Color'), '#123456');
    expect(spec.value.trendLine.color).toBe('#123456');
    click(Array.from(m!.root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Auto'));
    expect('color' in spec.value.trendLine).toBe(false);
    expect(spec.value.trendLine).toEqual({ enabled: true, model: 'log', perSeries: false, showEquation: true });
  });
});
