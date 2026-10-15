/**
 * The palette registry (docs/PALETTES.md; D-12; rule 7 [R-PALETTE]). Lists
 * exactly the ids of PALETTES.md §1–§2 with the validator's output recorded
 * on each entry at load. `colorblindSafe` is derived from that output (CVD
 * gate for categorical sets, monotone lightness for ramps); `labelsRequired`
 * is the §1 policy flag, and the CI rule holds: a set without it must pass
 * the CVD gate and the normal-vision floor (`registry.test.ts`).
 * Framework-free [R-PURE].
 */
import { CATEGORICAL_DEFS } from './categorical';
import { DIVERGING_DEFS, divergingArms } from './diverging';
import { SEQUENTIAL_DEFS, steppedForm } from './sequential';
import { SURFACES, validateCategorical, validateRamp, type PaletteValidation } from './validate';

export type PaletteKind = 'categorical' | 'sequential' | 'diverging';

export interface Palette {
  id: string;
  label: string;
  kind: PaletteKind;
  /** Categorical: ordered swatches. Sequential/diverging: ≥ 7 stops, light→dark (diverging: neg…mid…pos). */
  colors: string[];
  hue?: string;
  colorblindSafe: boolean;
  tags: string[];
  /** Picker shows "use with labels"; the set may fail the separation gates (§5 CI rule). */
  labelsRequired: boolean;
  /** The validator's output for this palette, computed at load (§5). */
  validation: PaletteValidation;
}

function categoricalPalettes(): Palette[] {
  return CATEGORICAL_DEFS.map((d) => {
    const categorical = validateCategorical(d.colors);
    const tags = d.labelsRequired && !d.tags.includes('labels-required') ? [...d.tags, 'labels-required'] : [...d.tags];
    return {
      id: d.id, label: d.label, kind: 'categorical', colors: [...d.colors],
      colorblindSafe: categorical.cvdPass, tags, labelsRequired: d.labelsRequired,
      validation: { surfaces: [...SURFACES], categorical },
    };
  });
}

function sequentialPalettes(): Palette[] {
  return SEQUENTIAL_DEFS.map((d) => {
    const ramp = validateRamp(steppedForm(d.colors), { multiHue: d.multiHue, exempt: d.exempt });
    const p: Palette = {
      id: d.id, label: d.label, kind: 'sequential', colors: [...d.colors],
      colorblindSafe: ramp.monotone, tags: [...d.tags], labelsRequired: false,
      validation: { surfaces: [...SURFACES], ramp },
    };
    if (d.hue) p.hue = d.hue;
    return p;
  });
}

function divergingPalettes(): Palette[] {
  return DIVERGING_DEFS.map((d) => {
    const ramp = validateRamp(d.colors, { multiHue: true, exempt: d.exempt, arms: divergingArms(d.colors) });
    const p: Palette = {
      id: d.id, label: d.label, kind: 'diverging', colors: [...d.colors],
      colorblindSafe: ramp.monotone, tags: [...d.tags], labelsRequired: false,
      validation: { surfaces: [...SURFACES], ramp },
    };
    if (d.hue) p.hue = d.hue;
    return p;
  });
}

/** All palettes, in picker order: categorical sets, sequential ramps, diverging ramps. */
export const PALETTES: readonly Palette[] = [...categoricalPalettes(), ...sequentialPalettes(), ...divergingPalettes()];

const BY_ID: ReadonlyMap<string, Palette> = new Map(PALETTES.map((p) => [p.id, p]));

/** Lookup by id; undefined when unknown. */
export function getPalette(id: string): Palette | undefined {
  return BY_ID.get(id);
}

/** Palettes of one kind, in picker order. */
export function palettesOfKind(kind: PaletteKind): Palette[] {
  return PALETTES.filter((p) => p.kind === kind);
}
