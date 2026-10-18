/**
 * The palette registry (docs/PALETTES.md; D-12, D-18; rule 7 [R-PALETTE]).
 * Lists exactly the ids of PALETTES.md §1–§2 and §6 with the validator's
 * output recorded on each entry at load. `colorblindSafe` is derived from
 * that output (CVD gate for categorical sets, monotone lightness for ramps);
 * `labelsRequired` is the §1 policy flag (derived from the validator for the
 * §6 families), and the CI rule holds: a set without it must pass the CVD
 * gate and the normal-vision floor (`registry.test.ts`). Every palette
 * belongs to exactly one family (`PALETTE_FAMILIES`), carried as `family`
 * and as a tag. Framework-free [R-PURE].
 */
import { CATEGORICAL_DEFS } from './categorical';
import { DIVERGING_DEFS, divergingArms } from './diverging';
import { PALETTE_FAMILIES, familyOf, type PaletteFamily } from './families';
import { SEQUENTIAL_DEFS, steppedForm } from './sequential';
import { SURFACES, validateCategorical, validateRamp, type PaletteValidation } from './validate';

export { PALETTE_FAMILIES, type PaletteFamily };

export type PaletteKind = 'categorical' | 'sequential' | 'diverging';

export interface Palette {
  id: string;
  label: string;
  kind: PaletteKind;
  /** Categorical: ordered swatches. Sequential/diverging: ≥ 7 stops, light→dark (diverging: neg…mid…pos). */
  colors: string[];
  hue?: string;
  colorblindSafe: boolean;
  /** Includes the family id and, when `labelsRequired`, `labels-required`. */
  tags: string[];
  /** Picker shows "use with labels"; the set may fail the separation gates (§5 CI rule). */
  labelsRequired: boolean;
  /** Family id (`PALETTE_FAMILIES`); `other` when the id is in no family (the family test forbids it). */
  family: string;
  /** The validator's output for this palette, computed at load (§5). */
  validation: PaletteValidation;
}

/** Tags with the family id first and `labels-required` appended once when the flag is set. */
function withFamilyTags(id: string, tags: readonly string[], labelsRequired: boolean): { family: string; tags: string[] } {
  const family = familyOf(id) ?? 'other';
  const out = [family, ...tags.filter((t) => t !== family && t !== 'labels-required')];
  if (labelsRequired) out.push('labels-required');
  return { family, tags: out };
}

function categoricalPalettes(): Palette[] {
  return CATEGORICAL_DEFS.map((d) => {
    const categorical = validateCategorical(d.colors);
    return {
      id: d.id, label: d.label, kind: 'categorical', colors: [...d.colors],
      colorblindSafe: categorical.cvdPass, labelsRequired: d.labelsRequired,
      ...withFamilyTags(d.id, d.tags, d.labelsRequired),
      validation: { surfaces: [...SURFACES], categorical },
    };
  });
}

function sequentialPalettes(): Palette[] {
  return SEQUENTIAL_DEFS.map((d) => {
    const ramp = validateRamp(steppedForm(d.colors), { multiHue: d.multiHue, exempt: d.exempt });
    const p: Palette = {
      id: d.id, label: d.label, kind: 'sequential', colors: [...d.colors],
      colorblindSafe: ramp.monotone, labelsRequired: false, ...withFamilyTags(d.id, d.tags, false),
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
      colorblindSafe: ramp.monotone, labelsRequired: false, ...withFamilyTags(d.id, d.tags, false),
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

/** Palettes of one family in the family's listed order (unknown ids are skipped); `[]` for an unknown family. */
export function palettesOfFamily(familyId: string): Palette[] {
  const f = PALETTE_FAMILIES.find((x) => x.id === familyId);
  return f ? f.paletteIds.map((id) => BY_ID.get(id)).filter((p): p is Palette => p !== undefined) : [];
}
