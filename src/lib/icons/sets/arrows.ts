/**
 * The `arrows` icon set (docs/ICONS.md). Direction and change: trends, flows and cycles.
 * Every path is hand-authored for this project from straight lines and arcs
 * (clockwise solids, counter-clockwise holes, fill-rule nonzero), licensed
 * MIT; no path is copied from another icon library. Framework-free [R-PURE].
 */
import type { IconSet } from '../types';

/** Arrows: 8 icons in fixed order. */
export const ARROWS: IconSet = {
  id: 'arrows',
  label: 'Arrows',
  description: 'Direction and change: trends, flows and cycles.',
  smallSafe: true,
  license: 'MIT',
  icons: [
    {
      id: 'up',
      label: 'Up',
      keywords: ['up', 'increase', 'rise', 'growth', 'north', 'higher'],
      path: 'M9.8 22 L9.8 10 L14.2 10 L14.2 22 Z M4.5 10.5 L12 2 L19.5 10.5 Z',
    },
    {
      id: 'down',
      label: 'Down',
      keywords: ['down', 'decrease', 'fall', 'decline', 'south', 'lower'],
      path: 'M14.2 2 L14.2 14 L9.8 14 L9.8 2 Z M19.5 13.5 L12 22 L4.5 13.5 Z',
    },
    {
      id: 'left',
      label: 'Left',
      keywords: ['left', 'back', 'west', 'previous', 'import'],
      path: 'M22 14.2 L10 14.2 L10 9.8 L22 9.8 Z M10.5 19.5 L2 12 L10.5 4.5 Z',
    },
    {
      id: 'right',
      label: 'Right',
      keywords: ['right', 'forward', 'east', 'next', 'export'],
      path: 'M2 9.8 L14 9.8 L14 14.2 L2 14.2 Z M13.5 4.5 L22 12 L13.5 19.5 Z',
    },
    {
      id: 'up-right',
      label: 'Up right',
      keywords: ['up-right', 'northeast', 'trend up', 'improving', 'positive'],
      path: 'M1.94 18.94 L13.29 7.6 L16.4 10.71 L5.06 22.06 Z M9.89 4.91 L20.5 3.5 L19.09 14.11 Z',
    },
    {
      id: 'down-right',
      label: 'Down right',
      keywords: ['down-right', 'southeast', 'trend down', 'worsening', 'negative'],
      path: 'M5.06 1.94 L16.4 13.29 L13.29 16.4 L1.94 5.06 Z M19.09 9.89 L20.5 20.5 L9.89 19.09 Z',
    },
    {
      id: 'both',
      label: 'Both ways',
      keywords: ['both', 'bidirectional', 'two-way', 'range', 'span', 'swap'],
      path: 'M7 10.1 L17 10.1 L17 13.9 L7 13.9 Z M8.5 19 L1.5 12 L8.5 5 Z M15.5 5 L22.5 12 L15.5 19 Z',
    },
    {
      id: 'cycle',
      label: 'Cycle',
      keywords: ['cycle', 'loop', 'refresh', 'repeat', 'recurring', 'circular', 'round trip'],
      path: 'M2.98 8.72 A9.6 9.6 0 0 1 21.02 8.72 L18.2 9.74 A6.6 6.6 0 0 0 5.8 9.74 Z M22.9 8.03 L21.05 13.18 L16.32 10.43 Z M21.02 15.28 A9.6 9.6 0 0 1 2.98 15.28 L5.8 14.26 A6.6 6.6 0 0 0 18.2 14.26 Z M1.1 15.97 L2.95 10.82 L7.68 13.57 Z',
    },
  ],
};
