/**
 * The `places` icon set (docs/ICONS.md). Map and location marks: sites, infrastructure and settlements.
 * Every path is hand-authored for this project from straight lines and arcs
 * (clockwise solids, counter-clockwise holes, fill-rule nonzero), licensed
 * MIT; no path is copied from another icon library. Framework-free [R-PURE].
 */
import type { IconSet } from '../types';

/** Places: 8 icons in fixed order. */
export const PLACES: IconSet = {
  id: 'places',
  label: 'Places',
  description: 'Map and location marks: sites, infrastructure and settlements.',
  smallSafe: false,
  license: 'MIT',
  icons: [
    {
      id: 'pin',
      label: 'Pin',
      keywords: ['pin', 'marker', 'location', 'site', 'point', 'poi'],
      path: 'M12 1.5 C16.7 1.5 20.5 5.3 20.5 10 C20.5 16 12 22.5 12 22.5 C12 22.5 3.5 16 3.5 10 C3.5 5.3 7.3 1.5 12 1.5 Z M9 10 A3 3 0 1 0 15 10 A3 3 0 1 0 9 10 Z',
    },
    {
      id: 'flag',
      label: 'Flag',
      keywords: ['flag', 'goal', 'target', 'milestone', 'checkpoint', 'start', 'finish'],
      path: 'M4 1.5 L6.4 1.5 L6.4 22.5 L4 22.5 Z M6.4 2.5 L21 2.5 L17 8 L21 13.5 L6.4 13.5 Z',
    },
    {
      id: 'home',
      label: 'Home',
      keywords: ['home', 'house', 'residence', 'residential', 'dwelling', 'base'],
      path: 'M12 2 L22.5 11.5 L19.5 11.5 L19.5 22 L4.5 22 L4.5 11.5 L1.5 11.5 Z M16 3.5 L19 3.5 L19 8.5 L16 8.5 Z M10 22 L14 22 L14 15 L10 15 Z',
    },
    {
      id: 'building',
      label: 'Building',
      keywords: ['building', 'office', 'tower', 'commercial', 'hq', 'headquarters', 'facility'],
      path: 'M5 2 L19 2 L19 22.5 L5 22.5 Z M7.8 7.4 L10.2 7.4 L10.2 5 L7.8 5 Z M13.8 7.4 L16.2 7.4 L16.2 5 L13.8 5 Z M7.8 11.4 L10.2 11.4 L10.2 9 L7.8 9 Z M13.8 11.4 L16.2 11.4 L16.2 9 L13.8 9 Z M7.8 15.4 L10.2 15.4 L10.2 13 L7.8 13 Z M13.8 15.4 L16.2 15.4 L16.2 13 L13.8 13 Z M10.5 22.5 L13.5 22.5 L13.5 17.5 L10.5 17.5 Z',
    },
    {
      id: 'factory',
      label: 'Factory',
      keywords: ['factory', 'plant', 'industrial', 'works', 'mill', 'refinery'],
      path: 'M2 22.5 L2 10 L8 6 L8 10 L14 6 L14 10 L16 10 L16 2.5 L21 2.5 L21 22.5 Z',
    },
    {
      id: 'port',
      label: 'Port',
      keywords: ['port', 'harbour', 'harbor', 'anchor', 'marine', 'dock', 'terminal', 'shipping'],
      path: 'M9.2 4.3 A2.8 2.8 0 1 1 14.8 4.3 A2.8 2.8 0 1 1 9.2 4.3 Z M10.8 4.3 A1.2 1.2 0 1 0 13.2 4.3 A1.2 1.2 0 1 0 10.8 4.3 Z M10.8 6.5 L13.2 6.5 L13.2 20.5 L10.8 20.5 Z M6.5 9 L17.5 9 L17.5 11.2 L6.5 11.2 Z M21.96 14.63 A10.6 10.6 0 0 1 2.04 14.63 L4.48 13.74 A8 8 0 0 0 19.52 13.74 Z',
    },
    {
      id: 'airport',
      label: 'Airport',
      keywords: ['airport', 'plane', 'aircraft', 'flight', 'aviation', 'air'],
      path: 'M12 1.5 L13.4 4 L13.4 20 L12 22.5 L10.6 20 L10.6 4 Z M10.6 9 L13.4 9 L22.5 15 L22.5 17.5 L13.4 14.5 L10.6 14.5 L1.5 17.5 L1.5 15 Z M10.6 18 L13.4 18 L17 21.5 L17 23 L12 21.5 L7 23 L7 21.5 Z',
    },
    {
      id: 'city',
      label: 'City',
      keywords: ['city', 'town', 'urban', 'metro', 'skyline', 'downtown', 'municipality'],
      path: 'M2 10 L8 10 L8 22.5 L2 22.5 Z M9 3 L16 3 L16 22.5 L9 22.5 Z M17 7 L22 7 L22 22.5 L17 22.5 Z M11.5 8 L13.5 8 L13.5 6 L11.5 6 Z M11.5 12 L13.5 12 L13.5 10 L11.5 10 Z M11.5 16 L13.5 16 L13.5 14 L11.5 14 Z',
    },
  ],
};
