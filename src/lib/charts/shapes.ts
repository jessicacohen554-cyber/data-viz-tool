/**
 * Shape shelf → icons (docs/ICONS.md §7): resolves the labels of a discrete
 * Shape pill to the icons of `marks.shapeSet` (default `basic`) with
 * `marks.shapeOverrides`, in fixed order and never cycled (rule R-PALETTE),
 * and gives the ECharts `path://` symbol per label plus the legend icon map.
 * Framework-free (rule R-PURE).
 */
import { DEFAULT_ICON_SET, type Icon, type IconSet, getIconSet, iconSymbol, iconsFor } from '../icons';
import type { BuildContext } from './registry';

/** Resolved shapes for one chart. */
export interface ShapeMap {
  set: IconSet;
  /** Label → icon (labels beyond the set and without an `other` icon are absent). */
  icons: Record<string, Icon>;
  /** Symbol string for a label; `circle` when the label has no icon. */
  symbolOf: (label: string) => string;
  /** Legend icon per label (`path://…`), for `legend(ctx, names, icons)`. */
  legendIcons: Record<string, string>;
  /** Symbol size in px: 12 for small-safe sets, 16 otherwise, never below `marks.sizeRange[0]`. */
  size: number;
}

/** Sizes below which a set does not read (ICONS.md §7). */
export const ICON_SIZE_SMALL = 12;
export const ICON_SIZE_REGULAR = 16;

/** The icon set a spec names, falling back to `basic`. */
export function shapeSet(ctx: BuildContext): IconSet {
  return getIconSet(ctx.spec.marks.shapeSet ?? DEFAULT_ICON_SET) ?? getIconSet(DEFAULT_ICON_SET)!;
}

/** Resolve `labels` (the Shape pill's distinct values, in first-appearance order) to icons. */
export function shapeMap(ctx: BuildContext, labels: string[]): ShapeMap {
  const set = shapeSet(ctx);
  const icons = iconsFor(set, labels, ctx.spec.marks.shapeOverrides);
  const legendIcons: Record<string, string> = {};
  for (const [label, icon] of Object.entries(icons)) legendIcons[label] = iconSymbol(icon);
  const base = set.smallSafe ? ICON_SIZE_SMALL : ICON_SIZE_REGULAR;
  return {
    set,
    icons,
    symbolOf: (label) => { const i = icons[label]; return i ? iconSymbol(i) : 'circle'; },
    legendIcons,
    size: Math.max(base, ctx.spec.marks.sizeRange[0]),
  };
}
