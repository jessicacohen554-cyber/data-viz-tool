/**
 * The `basic` icon set (docs/ICONS.md). Twelve geometric marks: the classic scatter and legend symbols.
 * Every path is hand-authored for this project from straight lines and arcs
 * (clockwise solids, counter-clockwise holes, fill-rule nonzero), licensed
 * MIT; no path is copied from another icon library. Framework-free [R-PURE].
 */
import type { IconSet } from '../types';

/** Basic: 12 icons in fixed order. */
export const BASIC: IconSet = {
  id: 'basic',
  label: 'Basic',
  description: 'Twelve geometric marks: the classic scatter and legend symbols.',
  smallSafe: true,
  license: 'MIT',
  icons: [
    {
      id: 'circle',
      label: 'Circle',
      keywords: ['dot', 'point', 'round'],
      path: 'M2 12 A10 10 0 1 1 22 12 A10 10 0 1 1 2 12 Z',
    },
    {
      id: 'square',
      label: 'Square',
      keywords: ['box', 'block'],
      path: 'M3 3 L21 3 L21 21 L3 21 Z',
    },
    {
      id: 'diamond',
      label: 'Diamond',
      keywords: ['rhombus', 'lozenge'],
      path: 'M12 1 L23 12 L12 23 L1 12 Z',
    },
    {
      id: 'triangle',
      label: 'Triangle',
      keywords: ['up', 'increase', 'delta'],
      path: 'M12 2 L23 21 L1 21 Z',
    },
    {
      id: 'triangle-down',
      label: 'Triangle down',
      keywords: ['down', 'decrease', 'nabla'],
      path: 'M1 3 L23 3 L12 22 Z',
    },
    {
      id: 'cross',
      label: 'Cross',
      keywords: ['x', 'times', 'multiply', 'error', 'fail'],
      path: 'M5.41 2.59 L21.41 18.59 L18.59 21.41 L2.59 5.41 Z M21.41 5.41 L5.41 21.41 L2.59 18.59 L18.59 2.59 Z',
    },
    {
      id: 'plus',
      label: 'Plus',
      keywords: ['add', 'positive', 'health'],
      path: 'M14.5 2 L14.5 22 L9.5 22 L9.5 2 Z M2 9.5 L22 9.5 L22 14.5 L2 14.5 Z',
    },
    {
      id: 'star',
      label: 'Star',
      keywords: ['favourite', 'favorite', 'best', 'top', 'rating'],
      path: 'M12 1.5 L14.82 8.62 L22.46 9.1 L16.57 13.98 L18.47 21.4 L12 17.3 L5.53 21.4 L7.43 13.98 L1.54 9.1 L9.18 8.62 Z',
    },
    {
      id: 'hexagon',
      label: 'Hexagon',
      keywords: ['hex', 'cell', 'honeycomb'],
      path: 'M12 1.5 L21.09 6.75 L21.09 17.25 L12 22.5 L2.91 17.25 L2.91 6.75 Z',
    },
    {
      id: 'pin',
      label: 'Pin',
      keywords: ['marker', 'location', 'place', 'site'],
      path: 'M12 1.5 C16.7 1.5 20.5 5.3 20.5 10 C20.5 16 12 22.5 12 22.5 C12 22.5 3.5 16 3.5 10 C3.5 5.3 7.3 1.5 12 1.5 Z M9 10 A3 3 0 1 0 15 10 A3 3 0 1 0 9 10 Z',
    },
    {
      id: 'ring',
      label: 'Ring',
      keywords: ['hollow', 'donut', 'open', 'circle-open'],
      path: 'M2 12 A10 10 0 1 1 22 12 A10 10 0 1 1 2 12 Z M5.5 12 A6.5 6.5 0 1 0 18.5 12 A6.5 6.5 0 1 0 5.5 12 Z',
    },
    {
      id: 'bar',
      label: 'Bar',
      keywords: ['line', 'tick', 'dash', 'pipe'],
      path: 'M8 2 L16 2 L16 22 L8 22 Z',
    },
  ],
};
