/**
 * The ported validator against the "Measured 2026-10-15" table of
 * docs/PALETTES.md §5, plus the typed wrappers.
 */
import { describe, expect, it } from 'vitest';
import { contrast, deltaE, oklch, validate, validateOrdinal } from '../../../scripts/validate_palette.js';
import { OBSERVATORY_COLORS, OBSERVATORY_ISO_COLORS } from './categorical';
import { SURFACES, isMonotoneLightness, validateCategorical, validateRamp } from './validate';

const OKABE = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000'];
const HEAT = ['#e8f3f7', '#7fc4e6', '#86c98f', '#f2d65c', '#ef8f3c', '#c0392b'];

describe('validator reproduces PALETTES.md §5 measurements (surface #F8F9FC)', () => {
  it('observatory (10): CVD 5.7 wind↔solar protan, normal 7.6, coal off band, two below chroma', () => {
    const { metrics, ok } = validate(OBSERVATORY_COLORS.slice(0, 10));
    expect(ok).toBe(false);
    expect(metrics.cvdWorst).toBe(5.7);
    expect(metrics.cvdKind).toBe('protan');
    expect(metrics.cvdPair).toEqual(['#F59E0B', '#22C55E']);
    expect(metrics.normalWorst).toBe(7.6);
    expect(metrics.normalPair).toEqual(['#26A69A', '#10B981']);
    expect(metrics.offBand).toEqual(['#374151']);
    expect(metrics.lowChroma).toEqual(['#6B7280', '#374151']);
    expect(metrics.lowContrast).toEqual(['#F59E0B', '#22C55E', '#0EA5E9', '#E67E22', '#26A69A', '#10B981']);
  });
  it('observatory-iso (9): CVD 5.7, normal 20.3, band and chroma pass', () => {
    const { metrics } = validate(OBSERVATORY_ISO_COLORS);
    expect(metrics.cvdWorst).toBe(5.7);
    expect(metrics.normalWorst).toBe(20.3);
    expect(metrics.offBand).toEqual([]);
    expect(metrics.lowChroma).toEqual([]);
  });
  it('okabe-ito (8): CVD 15.8, normal 16.4; yellow and black off band', () => {
    const { metrics } = validate(OKABE);
    expect(metrics.cvdWorst).toBe(15.8);
    expect(metrics.normalWorst).toBe(16.4);
    expect(metrics.offBand).toEqual(['#F0E442', '#000000']);
    expect(metrics.lowContrast.length).toBe(4);
  });
  it('seq-observatory-heat: non-monotone, hue spread 159°, light end 1.07:1', () => {
    const { metrics, ok } = validateOrdinal(HEAT);
    expect(ok).toBe(false);
    expect(metrics.monotone).toBe(false);
    expect(metrics.hueSpread).toBe(159);
    expect(metrics.lightEndContrast).toBe(1.07);
  });
  it('report rows carry the five categorical checks and four ordinal checks', () => {
    expect(validate(OKABE).report.map((r) => r[0])).toEqual(['Lightness band', 'Chroma floor', 'CVD separation', 'Normal-vision floor', 'Contrast vs surface']);
    expect(validateOrdinal(HEAT).report.map((r) => r[0])).toEqual(['Lightness monotone', 'Adjacent ΔL', 'Light-end contrast', 'Single hue']);
  });
  it('pairs: all mode and single colors do not crash', () => {
    expect(validate(['#F59E0B', '#6366F1'], { pairs: 'all' }).metrics.cvdWorst).toBeGreaterThan(8);
    expect(validate(['#F59E0B']).metrics.cvdWorst).toBe(99);
  });
});

describe('color math', () => {
  it('contrast is symmetric and WCAG-exact for black on white', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });
  it('ΔE of a color to itself is 0 and simulated ΔE never exceeds ~normal for grays', () => {
    expect(deltaE('#0EA5E9', '#0EA5E9', 'protan')).toBe(0);
    expect(deltaE('#777777', '#999999', 'deutan')).toBeCloseTo(deltaE('#777777', '#999999'), 1);
  });
  it('oklch of white is L 1, C 0', () => {
    const [L, C] = oklch('#FFFFFF');
    expect(L).toBeCloseTo(1, 3);
    expect(C).toBeCloseTo(0, 3);
  });
});

describe('typed wrappers', () => {
  it('validateCategorical runs on both surfaces', () => {
    const v = validateCategorical(OBSERVATORY_COLORS.slice(0, 10));
    expect(Object.keys(v.lowContrast)).toEqual([...SURFACES]);
    expect(v.cvdPass).toBe(false);
    expect(v.normalPass).toBe(false);
    expect(validateCategorical(OKABE).cvdPass).toBe(true);
  });
  it('validateRamp reports the worst surface and arm', () => {
    const r = validateRamp(HEAT, { exempt: true });
    expect(r.exempt).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.lightEnd['#F8F9FC']).toBe(1.07);
    expect(r.lightEnd['#FFFFFF']).toBeGreaterThan(r.lightEnd['#F8F9FC']!); // white is the brighter surface
  });
  it('isMonotoneLightness', () => {
    expect(isMonotoneLightness(['#FFFFFF', '#888888', '#000000'])).toBe(true);
    expect(isMonotoneLightness(['#000000', '#888888', '#FFFFFF'])).toBe(true);
    expect(isMonotoneLightness(['#000000', '#FFFFFF', '#888888'])).toBe(false);
    expect(isMonotoneLightness(['#888888', '#888888'])).toBe(false);
  });
});
