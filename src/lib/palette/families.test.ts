/**
 * Palette families v2 (docs/PALETTES.md §6, D-18): construction bands, the
 * ≥ 8-color rule, derived flags, monotone family ramps and the family index.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORICAL_DEFS } from './categorical';
import { DIVERGING_DEFS, FAMILY_DIVERGING_SPECS } from './diverging';
import {
  BAND_HUES, BAND_SPECS, FAMILY_CATEGORICAL_DEFS, MONOCHROME_L, MONOCHROME_SPECS, PALETTE_FAMILIES, THEMED_SPECS, bandSet, familyOf,
  monochromeSet, themedColors,
} from './families';
import { PALETTES, getPalette, palettesOfFamily } from './registry';
import { FAMILY_HUE_RAMP_SPECS, FAMILY_SEQUENTIAL_SPECS, SEQUENTIAL_DEFS, hexToOklch, makeHueRamp } from './sequential';
import { isMonotoneLightness } from './validate';

const hueDist = (a: number, b: number): number => { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d; };

/** The D-18 family categorical sets (pastel lives in its §1 slot). */
const FAMILY_SET_IDS = ['pastel', 'neon', 'vibrant', 'muted', 'earthy', 'ocean', 'sunset', 'forest', 'berry', 'candy', 'retro', 'corporate',
  'warm', 'cool', 'high-contrast', 'monochrome-navy', 'monochrome-teal'];

describe('band families (§6.1)', () => {
  it('the wheel has ten hues ≥ 30° apart in sorted order', () => {
    expect(BAND_HUES).toHaveLength(10);
    const sorted = [...BAND_HUES].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) expect(hueDist(sorted[i]!, sorted[(i + 1) % sorted.length]!)).toBeGreaterThanOrEqual(30);
  });
  it('every band set sits at its stated lightness on every wheel hue (chroma may clip)', () => {
    for (const b of BAND_SPECS) {
      const colors = getPalette(b.id)!.colors;
      expect(colors).toHaveLength(10);
      colors.forEach((hex, i) => {
        const [L, C, h] = hexToOklch(hex);
        expect(L, `${b.id}[${i}] L`).toBeCloseTo(b.L, 1);
        expect(C, `${b.id}[${i}] C`).toBeLessThanOrEqual(b.C + 0.005);
        expect(hueDist(h, BAND_HUES[i]!), `${b.id}[${i}] hue`).toBeLessThan(3);
      });
    }
  });
  it('pastel is the wheel at L 0.85 C 0.08 and keeps its §1 slot', () => {
    expect(getPalette('pastel')!.colors).toEqual(bandSet(0.85, 0.08));
    expect(CATEGORICAL_DEFS.findIndex((d) => d.id === 'pastel')).toBe(10);
  });
});

describe('themed families (§6.1)', () => {
  it('each swatch is rendered at its [L, C, h] (chroma clipped only when out of gamut)', () => {
    for (const spec of THEMED_SPECS) {
      const colors = themedColors(spec);
      expect(getPalette(spec.id)!.colors).toEqual(colors);
      colors.forEach((hex, i) => {
        const [, L, C, h] = spec.swatches[i]!;
        const [oL, oC, oh] = hexToOklch(hex);
        expect(oL, `${spec.id} ${spec.swatches[i]![0]} L`).toBeCloseTo(L, 2);
        expect(oC, `${spec.id} ${spec.swatches[i]![0]} C`).toBeLessThanOrEqual(C + 0.005);
        if (oC > 0.02) expect(hueDist(oh, h), `${spec.id} ${spec.swatches[i]![0]} hue`).toBeLessThan(3);
      });
    }
  });
  it('warm and cool are hue-restricted halves', () => {
    for (const [, , , h] of THEMED_SPECS.find((s) => s.id === 'warm')!.swatches) expect(h >= 340 || h <= 100, `warm ${h}`).toBe(true);
    for (const [, , , h] of THEMED_SPECS.find((s) => s.id === 'cool')!.swatches) expect(h >= 130 && h <= 330, `cool ${h}`).toBe(true);
  });
  it('high-contrast has 8 colors, passes both separation gates and is CVD-safe without labels', () => {
    const p = getPalette('high-contrast')!;
    expect(p.colors).toHaveLength(8);
    expect(p.colorblindSafe).toBe(true);
    expect(p.labelsRequired).toBe(false);
    expect(p.validation.categorical!.cvdWorst).toBeGreaterThanOrEqual(8);
    expect(p.validation.categorical!.normalWorst).toBeGreaterThanOrEqual(15);
    expect(p.validation.categorical!.offBand).toEqual([]);
  });
  it('monochromes are 8 tints of one hue, dark → light, flagged labels-required', () => {
    for (const m of MONOCHROME_SPECS) {
      const p = getPalette(m.id)!;
      expect(p.colors).toEqual(monochromeSet(m.hue, m.cMax));
      expect(p.colors).toHaveLength(MONOCHROME_L.length);
      expect(isMonotoneLightness(p.colors)).toBe(true);
      expect(p.labelsRequired).toBe(true);
      expect(p.tags).toContain('labels-required');
      for (const c of p.colors) { const [, C, h] = hexToOklch(c); if (C > 0.02) expect(hueDist(h, m.hue)).toBeLessThan(3); }
    }
  });
});

describe('acceptance: every family set has ≥ 8 colors and ships flagged or passing, never silently', () => {
  it('≥ 8 colors per family categorical set', () => {
    for (const id of FAMILY_SET_IDS) expect(getPalette(id)!.colors.length, id).toBeGreaterThanOrEqual(8);
    expect(FAMILY_CATEGORICAL_DEFS.map((d) => d.id)).toEqual(FAMILY_SET_IDS.filter((id) => id !== 'pastel'));
  });
  it('labelsRequired is derived: exactly the sets failing a separation gate (plus the monochromes by policy)', () => {
    for (const id of FAMILY_SET_IDS) {
      const p = getPalette(id)!;
      const v = p.validation.categorical!;
      const fails = !(v.cvdPass && v.normalPass);
      if (id.startsWith('monochrome-')) expect(p.labelsRequired).toBe(true);
      else expect(p.labelsRequired, `${id} cvd ${v.cvdWorst} normal ${v.normalWorst}`).toBe(fails);
    }
    expect(getPalette('pastel')!.labelsRequired).toBe(true);
    expect(getPalette('muted')!.labelsRequired).toBe(true);
    expect(getPalette('neon')!.labelsRequired).toBe(false);
    expect(getPalette('vibrant')!.labelsRequired).toBe(false);
  });
  it('every family set carries its family as a tag and the generated tag', () => {
    for (const id of FAMILY_SET_IDS) {
      const p = getPalette(id)!;
      expect(p.tags[0]).toBe(p.family);
      expect(p.tags).toContain('generated');
    }
  });
});

describe('family ramps (§6.2–§6.3)', () => {
  it('all sequential ramps are strictly monotone in OKLCH L (the exempt heat ramp aside)', () => {
    for (const d of SEQUENTIAL_DEFS) expect(isMonotoneLightness(d.colors), d.id).toBe(!d.exempt);
  });
  it('family single-hue ramps are 7 stops at the spec hue and pass the ordinal gate in stepped form', () => {
    for (const s of FAMILY_SEQUENTIAL_SPECS) {
      const p = getPalette(s.id)!;
      expect(p.colors).toHaveLength(7);
      expect(p.family).toBe(s.family);
      expect(p.validation.ramp!.ok, `${s.id} ${JSON.stringify(p.validation.ramp)}`).toBe(true);
      for (const c of p.colors) { const [, C, h] = hexToOklch(c); if (C > 0.02) expect(hueDist(h, s.hue), s.id).toBeLessThan(3); }
    }
  });
  it('makeHueRamp interpolates the hue light → dark along the signed path and stays monotone in L', () => {
    const ramp = makeHueRamp(85, -60, 0.18);
    expect(ramp).toHaveLength(7);
    expect(isMonotoneLightness(ramp)).toBe(true);
    expect(hueDist(hexToOklch(ramp[0]!)[2], 85)).toBeLessThan(4);
    expect(hueDist(hexToOklch(ramp[6]!)[2], 300)).toBeLessThan(4);
    const hues = ramp.map((c) => hexToOklch(c)[2]);
    // gold → orange → red → magenta → purple: hue decreases through 0°.
    for (let i = 1; i < hues.length; i++) expect(((hues[i - 1]! - hues[i]!) + 360) % 360, `step ${i}`).toBeLessThan(60);
  });
  it('family multi-hue ramps are generated, tagged multi-hue and pass the ordinal gate (hue spread skipped)', () => {
    for (const s of FAMILY_HUE_RAMP_SPECS) {
      const p = getPalette(s.id)!;
      expect(p.colors).toEqual(makeHueRamp(s.hueLight, s.hueDark, s.cMax));
      expect(p.tags).toContain('multi-hue');
      expect(p.validation.ramp!.ok, s.id).toBe(true);
      expect(p.validation.ramp!.monotone).toBe(true);
    }
  });
  it('family diverging pairs run cool → mid → warm with monotone arms', () => {
    for (const s of FAMILY_DIVERGING_SPECS) {
      const d = DIVERGING_DEFS.find((x) => x.id === s.id)!;
      expect(d.colors).toHaveLength(9);
      expect(hueDist(hexToOklch(d.colors[1]!)[2], s.cool), `${s.id} cool`).toBeLessThan(3);
      expect(hueDist(hexToOklch(d.colors[7]!)[2], s.warm), `${s.id} warm`).toBeLessThan(3);
      expect(getPalette(s.id)!.family).toBe(s.family);
    }
  });
});

describe('family index (PALETTE_FAMILIES)', () => {
  it('every registry id is in exactly one family and every listed id exists', () => {
    const listed = PALETTE_FAMILIES.flatMap((f) => f.paletteIds);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(PALETTES.map((p) => p.id).sort());
    for (const p of PALETTES) {
      expect(familyOf(p.id), p.id).toBe(p.family);
      expect(p.family).not.toBe('other');
      expect(p.tags[0]).toBe(p.family);
    }
  });
  it('family ids are unique and each family has a label and ≥ 1 palette', () => {
    expect(new Set(PALETTE_FAMILIES.map((f) => f.id)).size).toBe(PALETTE_FAMILIES.length);
    for (const f of PALETTE_FAMILIES) { expect(f.label.length).toBeGreaterThan(0); expect(f.paletteIds.length).toBeGreaterThan(0); }
  });
  it('palettesOfFamily returns the family in listed order; unknown → []', () => {
    expect(palettesOfFamily('neon').map((p) => p.id)).toEqual(['neon', 'seq-neon-pink', 'seq-neon-green', 'seq-neon-blue', 'div-neon']);
    expect(palettesOfFamily('nope')).toEqual([]);
    expect(familyOf('nope')).toBeUndefined();
  });
  it('the registry holds 67 palettes in 20 families', () => {
    expect(PALETTES).toHaveLength(67);
    expect(PALETTE_FAMILIES).toHaveLength(20);
  });
});
