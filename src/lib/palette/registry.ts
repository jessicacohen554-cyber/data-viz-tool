/**
 * STUB (S0) — replaced by shard S2 (docs/PALETTES.md). Shapes are frozen.
 */
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
}

/** All palettes, in picker order. */
export const PALETTES: readonly Palette[] = [];

/** Lookup by id; undefined when unknown. */
export function getPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}
