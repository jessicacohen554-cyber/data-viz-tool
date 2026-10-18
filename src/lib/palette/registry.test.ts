/**
 * The registry lists exactly the ids of docs/PALETTES.md, with validation
 * recorded from the validator (§5 CI rule, rule 7 [R-PALETTE]).
 */
import { describe, expect, it } from 'vitest';
import { validate, validateOrdinal } from '../../../scripts/validate_palette.js';
import { PALETTES, getPalette, palettesOfKind } from './registry';
import { steppedForm } from './sequential';
import { divergingArms } from './diverging';
import { SURFACES, isMonotoneLightness } from './validate';

/** Every id PALETTES.md lists, by kind (§1–§2, then the §6 families). */
const DOC_IDS = {
  categorical: ['observatory', 'observatory-iso', 'okabe-ito', 'classic-10', 'pairs-amber-indigo', 'pairs-sky-orange',
    'pairs-green-magenta', 'pairs-teal-brown', 'pairs-navy-gold', 'pairs-purple-lime', 'pastel', 'bold', 'grayscale',
    'neon', 'vibrant', 'muted', 'earthy', 'ocean', 'sunset', 'forest', 'berry', 'candy', 'retro', 'corporate', 'warm', 'cool',
    'high-contrast', 'monochrome-navy', 'monochrome-teal'],
  sequential: ['seq-sky', 'seq-indigo', 'seq-green', 'seq-amber', 'seq-orange', 'seq-navy', 'seq-gray', 'seq-teal', 'seq-rose',
    'viridis', 'magma', 'cividis', 'seq-observatory-heat',
    'seq-earth', 'seq-forest', 'seq-berry', 'seq-retro', 'seq-corporate', 'seq-muted', 'seq-neon-pink', 'seq-neon-green', 'seq-neon-blue',
    'seq-ocean', 'seq-sunset', 'seq-candy', 'seq-warm', 'seq-cool'],
  diverging: ['div-cool-warm', 'div-observatory', 'div-teal-brown', 'div-green-purple', 'div-sky-amber', 'div-navy-gold',
    'div-earth-ocean', 'div-sunset', 'div-berry-forest', 'div-neon', 'div-muted'],
};

describe('registry contents', () => {
  it('lists exactly the PALETTES.md ids, unique', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of ['categorical', 'sequential', 'diverging'] as const) {
      expect(palettesOfKind(kind).map((p) => p.id).sort()).toEqual([...DOC_IDS[kind]].sort());
    }
    expect(ids).toHaveLength(67);
  });
  it('every palette carries its family as `family` and first tag', () => {
    for (const p of PALETTES) {
      expect(p.family, p.id).not.toBe('other');
      expect(p.tags[0], p.id).toBe(p.family);
      expect(p.tags.filter((t) => t === 'labels-required').length, p.id).toBe(p.labelsRequired ? 1 : 0);
    }
  });
  it('getPalette finds by id and returns undefined otherwise', () => {
    expect(getPalette('seq-sky')?.kind).toBe('sequential');
    expect(getPalette('nope')).toBeUndefined();
  });
  it('every palette has ≥ 2 valid hex colors, a label and a validation block on both surfaces', () => {
    for (const p of PALETTES) {
      expect(p.colors.length, p.id).toBeGreaterThanOrEqual(2);
      for (const c of p.colors) expect(c, p.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.validation.surfaces).toEqual([...SURFACES]);
    }
  });
  it('ramps have ≥ 5 stops and diverging ramps an odd count with a neutral middle', () => {
    for (const p of palettesOfKind('sequential')) expect(p.colors.length, p.id).toBeGreaterThanOrEqual(5);
    for (const p of palettesOfKind('diverging')) expect(p.colors.length % 2, p.id).toBe(1);
  });
});

describe('§5 CI rule', () => {
  it('a categorical set without labels-required passes the CVD gate and the normal-vision floor on both surfaces', () => {
    for (const p of palettesOfKind('categorical')) {
      const v = p.validation.categorical!;
      if (!p.labelsRequired) {
        expect(v.cvdPass, `${p.id} cvd ${v.cvdWorst}`).toBe(true);
        expect(v.normalPass, `${p.id} normal ${v.normalWorst}`).toBe(true);
        expect(p.tags).not.toContain('labels-required');
      } else {
        expect(p.tags).toContain('labels-required');
      }
    }
  });
  it('colorblindSafe equals the CVD gate for categorical sets', () => {
    for (const p of palettesOfKind('categorical')) expect(p.colorblindSafe, p.id).toBe(p.validation.categorical!.cvdPass);
    expect(getPalette('okabe-ito')!.colorblindSafe).toBe(true);
    expect(getPalette('observatory')!.colorblindSafe).toBe(false);
    expect(getPalette('observatory')!.labelsRequired).toBe(true);
    expect(getPalette('observatory-iso')!.labelsRequired).toBe(true);
    expect(getPalette('grayscale')!.colorblindSafe).toBe(true);
  });
  it('the recorded validation block equals a fresh validator run (never re-typed)', () => {
    for (const p of palettesOfKind('categorical')) {
      const fresh = validate(p.colors, { surface: SURFACES[0] }).metrics;
      const v = p.validation.categorical!;
      expect(v.cvdWorst, p.id).toBe(fresh.cvdWorst);
      expect(v.normalWorst, p.id).toBe(fresh.normalWorst);
      expect(v.offBand, p.id).toEqual(fresh.offBand);
      expect(v.lowChroma, p.id).toEqual(fresh.lowChroma);
      expect(v.lowContrast[SURFACES[0]!], p.id).toEqual(fresh.lowContrast);
      expect(v.lowContrast[SURFACES[1]!], p.id).toEqual(validate(p.colors, { surface: SURFACES[1] }).metrics.lowContrast);
    }
  });
});

describe('ramps', () => {
  it('every sequential ramp except the exempt one is strictly monotone in OKLCH lightness', () => {
    for (const p of palettesOfKind('sequential')) {
      const exempt = p.validation.ramp!.exempt;
      expect(isMonotoneLightness(p.colors), p.id).toBe(!exempt);
      expect(p.validation.ramp!.monotone, p.id).toBe(!exempt);
      expect(p.colorblindSafe, p.id).toBe(!exempt);
    }
    expect(getPalette('seq-observatory-heat')!.tags).toContain('never-auto');
  });
  it('single-hue sequential ramps pass every ordinal check in stepped form (hard gate)', () => {
    for (const p of palettesOfKind('sequential').filter((x) => x.tags.includes('single-hue'))) {
      const r = p.validation.ramp!;
      expect(r.ok, `${p.id} ${JSON.stringify(r)}`).toBe(true);
      expect(r.minDeltaL).toBeGreaterThanOrEqual(0.06);
      expect(r.hueSpread).toBeLessThanOrEqual(40);
      for (const s of SURFACES) expect(r.lightEnd[s], `${p.id} ${s}`).toBeGreaterThanOrEqual(2);
      expect(validateOrdinal(steppedForm(p.colors), { surface: SURFACES[1] }).ok).toBe(true);
    }
  });
  it('multi-hue ramps are monotone and skip the hue-spread gate', () => {
    for (const id of ['viridis', 'magma', 'cividis']) {
      const p = getPalette(id)!;
      expect(p.validation.ramp!.monotone).toBe(true);
      expect(p.tags).toContain('multi-hue');
    }
  });
  it('every diverging ramp is symmetric with monotone arms and a visible step gap', () => {
    for (const p of palettesOfKind('diverging')) {
      const [cool, warm] = divergingArms(p.colors);
      expect(isMonotoneLightness(cool), p.id).toBe(true);
      expect(isMonotoneLightness(warm), p.id).toBe(true);
      expect(p.validation.ramp!.monotone, p.id).toBe(true);
      expect(p.validation.ramp!.minDeltaL, p.id).toBeGreaterThanOrEqual(0.06);
      expect(p.colorblindSafe, p.id).toBe(true);
    }
  });
});
