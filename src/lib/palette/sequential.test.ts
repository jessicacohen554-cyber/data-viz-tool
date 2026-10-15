import { describe, expect, it } from 'vitest';
import { oklch } from '../../../scripts/validate_palette.js';
import {
  SEQUENTIAL_DEFS, SEQUENTIAL_SPECS, SEQUENTIAL_STOPS_L, hexToOklch, makeRamp, oklchToHex, rampChroma, steppedForm,
} from './sequential';

describe('OKLCH ⇄ hex', () => {
  it('round-trips the Observatory anchors', () => {
    for (const hex of ['#0EA5E9', '#F59E0B', '#22C55E', '#6366F1', '#1A2744', '#6B7280']) {
      const [L, C, h] = hexToOklch(hex);
      expect(oklchToHex(L, C, h)).toBe(hex);
    }
  });
  it('agrees with the validator on lightness and hue', () => {
    const [L, C, h] = hexToOklch('#0EA5E9');
    const [vL, vC, vh] = oklch('#0EA5E9');
    expect(L).toBeCloseTo(vL, 6);
    expect(C).toBeCloseTo(vC, 6);
    expect(h).toBeCloseTo(vh, 6);
    expect(Math.round(h)).toBe(237); // PALETTES.md §2.1: Sky hue 237°
  });
  it('clips out-of-gamut chroma while keeping lightness and hue', () => {
    const hex = oklchToHex(0.55, 0.5, 150);
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    const [L, , h] = hexToOklch(hex);
    expect(L).toBeCloseTo(0.55, 2);
    expect(Math.abs(h - 150)).toBeLessThan(1.5);
  });
  it('rejects malformed hex', () => {
    expect(() => hexToOklch('blue')).toThrow();
  });
});

describe('single-hue ramps (§2.1)', () => {
  it('chroma profile peaks at L 0.60 and reaches 0 at the band edges', () => {
    expect(rampChroma(0.6, 0.14)).toBeCloseTo(0.14, 6);
    expect(rampChroma(0.15, 0.14)).toBeCloseTo(0, 10);
    expect(rampChroma(0.05, 0.14)).toBe(0);
    expect(rampChroma(0.95, 0.14)).toBeCloseTo(0.14 * (1 - 0.35 / 0.45), 6);
  });
  it('every spec yields 7 stops, strictly decreasing in L by ≈ 0.10, at the spec hue', () => {
    for (const s of SEQUENTIAL_SPECS) {
      const colors = makeRamp(s.hue, s.cMax);
      expect(colors).toHaveLength(SEQUENTIAL_STOPS_L.length);
      const Ls = colors.map((c) => hexToOklch(c)[0]);
      for (let i = 1; i < Ls.length; i++) {
        expect(Ls[i]!).toBeLessThan(Ls[i - 1]!);
        expect(Math.abs(Ls[i - 1]! - Ls[i]! - 0.10)).toBeLessThan(0.012);
      }
      for (const c of colors) {
        const [, C, h] = hexToOklch(c);
        if (C > 0.02) { // hue is meaningless at near-zero chroma (seq-gray)
          let d = Math.abs(h - s.hue); if (d > 180) d = 360 - d;
          expect(d).toBeLessThan(3);
        }
      }
    }
  });
  it('the anchor hue of each spec matches the Observatory token (±3°; the gray anchor has almost no chroma)', () => {
    for (const s of SEQUENTIAL_SPECS) {
      const anchorHue = hexToOklch(s.anchor)[2];
      let d = Math.abs(anchorHue - s.hue); if (d > 180) d = 360 - d;
      expect(d, `${s.id} anchor ${s.anchor}`).toBeLessThan(3);
    }
  });
  it('stepped form is stops 3–7 of a 7-stop ramp; fixed ramps pass through', () => {
    const ramp = makeRamp(237, 0.14);
    expect(steppedForm(ramp)).toEqual(ramp.slice(2));
    expect(steppedForm(['#000000', '#FFFFFF'])).toEqual(['#000000', '#FFFFFF']);
  });
  it('definitions list nine generated then four fixed ramps', () => {
    expect(SEQUENTIAL_DEFS.map((d) => d.id)).toEqual([
      'seq-sky', 'seq-indigo', 'seq-green', 'seq-amber', 'seq-orange', 'seq-navy', 'seq-gray', 'seq-teal', 'seq-rose',
      'viridis', 'magma', 'cividis', 'seq-observatory-heat',
    ]);
    expect(SEQUENTIAL_DEFS.find((d) => d.id === 'seq-observatory-heat')?.exempt).toBe(true);
    expect(SEQUENTIAL_DEFS.find((d) => d.id === 'viridis')?.colors).toEqual(['#440154', '#443983', '#31688E', '#21918C', '#35B779', '#90D743', '#FDE725']);
  });
});
