/**
 * Public surface of the icon library (docs/ICONS.md): the contract types,
 * the registry and its resolution helpers, the path validator and the
 * preview builder. Framework-free [R-PURE].
 */
export type { Icon, IconSet } from './types';
export { ICON_SETS, DEFAULT_ICON_SET, OVERFLOW_ICON_ID, getIconSet, iconSymbol, matchIcon, iconsFor } from './registry';
export { validateIconPath, measureIcon, parsePath, pathBounds, rasterize, ICON_BOX } from './validate';
export { previewSvg } from './preview';
