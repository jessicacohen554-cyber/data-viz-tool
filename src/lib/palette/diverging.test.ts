import { describe, expect, it } from 'vitest';
import { DIVERGING_ARM_L, DIVERGING_DEFS, DIVERGING_SPECS, DIV_OBSERVATORY, divergingArms, makeDivergingRamp } from './diverging';
import { hexToOklch } from './sequential';

describe('diverging ramps (§2.3)', () => {
  it('generates 9 stops: cool dark→light, neutral mid, warm light→dark', () => {
    const ramp = makeDivergingRamp(237, 0.14, 27, 0.14);
    expect(ramp).toHaveLength(9);
    const Ls = ramp.map((c) => hexToOklch(c)[0]);
    for (let i = 0; i < 4; i++) {
      expect(Ls[i]!).toBeCloseTo(DIVERGING_ARM_L[i]!, 1);
      expect(Ls[8 - i]!).toBeCloseTo(DIVERGING_ARM_L[i]!, 1);
    }
    const [midL, midC] = hexToOklch(ramp[4]!);
    expect(midL).toBeCloseTo(0.9, 1);
    expect(midC).toBeLessThan(0.005);
  });
  it('is symmetric in lightness and each arm is strictly monotone', () => {
    for (const d of DIVERGING_DEFS) {
      const Ls = d.colors.map((c) => hexToOklch(c)[0]);
      const n = Ls.length;
      if (!d.tags.includes('fixed')) { // the generated ramps share one L profile; div-observatory is a fixed list
        for (let i = 0; i < Math.floor(n / 2); i++) expect(Math.abs(Ls[i]! - Ls[n - 1 - i]!), d.id).toBeLessThan(0.02);
      }
      const [cool, warm] = divergingArms(d.colors);
      for (const arm of [cool, warm]) {
        const aL = arm.map((c) => hexToOklch(c)[0]);
        for (let i = 1; i < aL.length; i++) expect(aL[i]!, d.id).toBeLessThan(aL[i - 1]!);
      }
    }
  });
  it('cool and warm hues follow the spec (±3°)', () => {
    for (const s of DIVERGING_SPECS) {
      const def = DIVERGING_DEFS.find((d) => d.id === s.id)!;
      const near = (hex: string, hue: number): boolean => { let d = Math.abs(hexToOklch(hex)[2] - hue); if (d > 180) d = 360 - d; return d < 3; };
      expect(near(def.colors[1]!, s.cool), `${s.id} cool`).toBe(true);
      expect(near(def.colors[7]!, s.warm), `${s.id} warm`).toBe(true);
    }
  });
  it('div-observatory is the fixed white-mid ramp', () => {
    const def = DIVERGING_DEFS.find((d) => d.id === 'div-observatory')!;
    expect(def.colors).toEqual([...DIV_OBSERVATORY]);
    expect(def.colors[2]).toBe('#ffffff');
    expect(def.tags).toContain('needs-cell-border');
  });
  it('lists the six ids in §2.3 order', () => {
    expect(DIVERGING_DEFS.map((d) => d.id)).toEqual(['div-cool-warm', 'div-teal-brown', 'div-green-purple', 'div-sky-amber', 'div-navy-gold', 'div-observatory']);
  });
});
