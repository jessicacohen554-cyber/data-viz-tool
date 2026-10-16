/**
 * The icon-set contract (docs/ICONS.md). An icon is one SVG path in a
 * 24 × 24 box that ECharts draws as a mark via `symbol: 'path://<d>'`; a set
 * is an ordered list of icons that a discrete Shape pill maps its labels to
 * in fixed order, like a categorical palette (rule 7 [R-PALETTE]).
 * Framework-free, no DOM [R-PURE].
 */

/** One mark glyph. */
export interface Icon {
  /** Unique within its set; `kebab-case`. */
  id: string;
  label: string;
  /** SVG path `d` in a 0..24 × 0..24 viewBox, single path, fill-rule nonzero */
  path: string;
  /** Optional keywords for name-matching labels to icons */
  keywords: string[];
}

/** An ordered icon set; position in `icons` is the fixed assignment order. */
export interface IconSet {
  /** `kebab-case`, unique across the registry. */
  id: string;
  label: string;
  description: string;
  icons: Icon[];
  /** true when every icon reads at 12 px (simple silhouettes) */
  smallSafe: boolean;
  /** SPDX-style license of the paths (docs/ICONS.md carries the text). */
  license: string;
}
