import { describe, expect, it } from 'vitest';
import type { BuildContext } from './registry';
import {
  DEFAULT_THEME, FALLBACK_CATEGORICAL, axisKind, baseOption, classify, interpolateStops, legend, luminance, pillLabel, seriesColors, textOn, tooltip,
} from './option-common';
import { date, dim, makeSpec, measure, trivial } from './test-fixtures';

function ctxOf(spec: ReturnType<typeof makeSpec>, result = trivial().result, isMobile = false): BuildContext {
  return { spec, result, meta: [], isMobile };
}

describe('pill classification', () => {
  it('splits dims, measures and dates; a binned measure is a dimension', () => {
    const c = classify(makeSpec('bar', { columns: [dim('zone'), measure('x', 'sum', { bin: { count: 10 } })], rows: [measure('p')], color: [date('ts')] }));
    expect(c.dims.map((p) => p.field)).toEqual(['zone', 'x', 'ts']);
    expect(c.measures.map((p) => p.field)).toEqual(['p']);
    expect(c.dates.map((p) => p.field)).toEqual(['ts']);
  });

  it('labels pills in Tableau form and picks axis kinds', () => {
    expect(pillLabel(measure('price', 'avg'))).toBe('AVG(price)');
    expect(pillLabel(date('ts', 'month'))).toBe('MONTH(ts)');
    expect(pillLabel(dim('zone', { alias: 'Zone' }))).toBe('Zone');
    expect(axisKind(date('ts', 'month', 'trunc'))).toBe('time');
    expect(axisKind(date('ts', 'month', 'part'))).toBe('category');
    expect(axisKind(measure('p'))).toBe('value');
    expect(axisKind(measure('p', 'sum', { bin: { size: 5 } }))).toBe('category');
  });
});

describe('color', () => {
  it('assigns fixed-order hues by series position and never cycles past the set', () => {
    const names = Array.from({ length: FALLBACK_CATEGORICAL.length + 2 }, (_, i) => `s${i}`);
    const colors = seriesColors(ctxOf(makeSpec('bar', { color: [dim('zone')] })), names);
    expect(colors.slice(0, 3)).toEqual(FALLBACK_CATEGORICAL.slice(0, 3));
    expect(colors[FALLBACK_CATEGORICAL.length]).toBe(DEFAULT_THEME.border);
    expect(colors[FALLBACK_CATEGORICAL.length + 1]).toBe(DEFAULT_THEME.border);
  });

  it('a single series takes the accent, overrides win', () => {
    expect(seriesColors(ctxOf(makeSpec('bar', {})), ['only'])).toEqual([DEFAULT_THEME.accent]);
    const spec = makeSpec('bar', { color: [dim('zone')] }, (s) => { s.palette.overrides = { b: '#123456' }; });
    expect(seriesColors(ctxOf(spec), ['a', 'b'])[1]).toBe('#123456');
  });

  it('interpolates stops and picks readable text', () => {
    expect(interpolateStops(['#000000', '#ffffff'], 0)).toBe('#000000');
    expect(interpolateStops(['#000000', '#ffffff'], 1)).toBe('#ffffff');
    expect(interpolateStops(['#000000', '#ffffff'], 0.5)).toBe('#808080');
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(textOn('#ffffff', DEFAULT_THEME)).toBe(DEFAULT_THEME.text);
    expect(textOn('#0369A1', DEFAULT_THEME)).toBe(DEFAULT_THEME.textOnDark);
  });
});

describe('option fragments', () => {
  it('legend shows only for ≥ 2 series and follows spec.legend', () => {
    const spec = makeSpec('bar', {});
    expect(legend(ctxOf(spec), ['a']).show).toBe(false);
    expect(legend(ctxOf(spec), ['a', 'b']).show).toBe(true);
    spec.legend.show = false;
    expect(legend(ctxOf(spec), ['a', 'b']).show).toBe(false);
  });

  it('tooltip is instant, confined, and click-triggered on touch', () => {
    const t = tooltip(ctxOf(makeSpec('bar', {})));
    expect(t.transitionDuration).toBe(0);
    expect(t.confine).toBe(true);
    expect(t.triggerOn).toBe('mousemove|click');
    expect(tooltip(ctxOf(makeSpec('bar', {}), trivial().result, true)).triggerOn).toBe('click');
  });

  it('animation is off on mobile and above 5K points', () => {
    const spec = makeSpec('bar', {});
    expect(baseOption(ctxOf(spec), 100).animation).toBe(true);
    expect(baseOption(ctxOf(spec), 5001).animation).toBe(false);
    expect(baseOption(ctxOf(spec, trivial().result, true), 100).animation).toBe(false);
  });
});
