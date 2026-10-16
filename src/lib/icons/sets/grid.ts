/**
 * The `grid` icon set (docs/ICONS.md). Transmission and distribution assets, loads and interconnections.
 * Every path is hand-authored for this project from straight lines and arcs
 * (clockwise solids, counter-clockwise holes, fill-rule nonzero), licensed
 * MIT; no path is copied from another icon library. Framework-free [R-PURE].
 */
import type { IconSet } from '../types';

/** Grid: 10 icons in fixed order. */
export const GRID: IconSet = {
  id: 'grid',
  label: 'Grid',
  description: 'Transmission and distribution assets, loads and interconnections.',
  smallSafe: false,
  license: 'MIT',
  icons: [
    {
      id: 'tower',
      label: 'Transmission tower',
      keywords: ['tower', 'transmission', 'pylon', 'lattice', 'hv', 'ehv', '345', '500'],
      path: 'M9.5 22.5 L11 1.5 L13 1.5 L14.5 22.5 Z M3 5 L21 5 L21 7.2 L3 7.2 Z M5 10.5 L19 10.5 L19 12.7 L5 12.7 Z M5 22.5 L11 14 L13 14 L19 22.5 L16 22.5 L12 17 L8 22.5 Z',
    },
    {
      id: 'substation',
      label: 'Substation',
      keywords: ['substation', 'sub', 'switchyard', 'station', 'bus', 'node'],
      path: 'M2 9 L22 9 L22 22 L2 22 Z M5 2.5 L7.6 2.5 L7.6 9 L5 9 Z M10.7 2.5 L13.3 2.5 L13.3 9 L10.7 9 Z M16.4 2.5 L19 2.5 L19 9 L16.4 9 Z M10.5 22 L13.5 22 L13.5 15.5 L10.5 15.5 Z',
    },
    {
      id: 'transformer',
      label: 'Transformer',
      keywords: ['transformer', 'xfmr', 'winding', 'step-up', 'step-down', 'voltage'],
      path: 'M1.5 12 A7 7 0 1 1 15.5 12 A7 7 0 1 1 1.5 12 Z M4.5 12 A4 4 0 1 0 12.5 12 A4 4 0 1 0 4.5 12 Z M8.5 12 A7 7 0 1 1 22.5 12 A7 7 0 1 1 8.5 12 Z M11.5 12 A4 4 0 1 0 19.5 12 A4 4 0 1 0 11.5 12 Z',
    },
    {
      id: 'line',
      label: 'Power line',
      keywords: ['line', 'circuit', 'wire', 'conductor', 'feeder', 'branch', 'tie'],
      path: 'M2.5 3 L4.9 3 L4.9 22.5 L2.5 22.5 Z M19.1 3 L21.5 3 L21.5 22.5 L19.1 22.5 Z M1 6 L6.4 6 L6.4 8.2 L1 8.2 Z M17.6 6 L23 6 L23 8.2 L17.6 8.2 Z M4.9 6.8 Q12 14.6 19.1 6.8 V9.3 Q12 17.1 4.9 9.3 Z',
    },
    {
      id: 'load',
      label: 'Load',
      keywords: ['load', 'demand', 'home', 'house', 'residential', 'consumer', 'customer', 'consumption'],
      path: 'M12 2.5 L22.5 12 L19.5 12 L19.5 22 L4.5 22 L4.5 12 L1.5 12 Z M13.2 9.5 L9.2 15 L11.8 15 L10.8 20 L14.8 14 L12.2 14 Z',
    },
    {
      id: 'factory',
      label: 'Factory',
      keywords: ['factory', 'industrial', 'industry', 'manufacturing', 'commercial', 'c&i', 'large load'],
      path: 'M2 22.5 L2 10 L8 6 L8 10 L14 6 L14 10 L16 10 L16 2.5 L21 2.5 L21 22.5 Z',
    },
    {
      id: 'ev-charger',
      label: 'EV charger',
      keywords: ['ev', 'charger', 'charging', 'vehicle', 'car', 'evse', 'fleet', 'transport'],
      path: 'M2 13.5 L5 13.5 L8 7.5 L16 7.5 L19 13.5 L22 13.5 L22 18.5 L2 18.5 Z M3.9 18.5 A2.6 2.6 0 1 1 9.1 18.5 A2.6 2.6 0 1 1 3.9 18.5 Z M14.9 18.5 A2.6 2.6 0 1 1 20.1 18.5 A2.6 2.6 0 1 1 14.9 18.5 Z M13.2 9.3 L9.8 13.8 L12 13.8 L11 17.3 L14.4 12.8 L12.2 12.8 Z',
    },
    {
      id: 'meter',
      label: 'Meter',
      keywords: ['meter', 'metering', 'gauge', 'ami', 'smart meter', 'reading', 'measure'],
      path: 'M1.5 15 A10.5 10.5 0 0 1 22.5 15 L19 15 A7 7 0 0 0 5 15 Z M11.07 14.41 L15.57 7.41 L17.43 8.59 L12.93 15.59 Z M9.6 15 A2.4 2.4 0 1 1 14.4 15 A2.4 2.4 0 1 1 9.6 15 Z M2 17.5 L22 17.5 L22 20.5 L2 20.5 Z',
    },
    {
      id: 'interconnect',
      label: 'Interconnect',
      keywords: ['interconnect', 'interconnection', 'interchange', 'import', 'export', 'dc tie', 'flow', 'transfer', 'exchange'],
      path: 'M2 5.6 L16 5.6 L16 8.4 L2 8.4 Z M15.5 3 L22 7 L15.5 11 Z M22 18.4 L8 18.4 L8 15.6 L22 15.6 Z M8.5 21 L2 17 L8.5 13 Z',
    },
    {
      id: 'switch',
      label: 'Switch',
      keywords: ['switch', 'breaker', 'disconnect', 'recloser', 'outage', 'open', 'trip'],
      path: 'M1.5 15.8 L7.5 15.8 L7.5 18.2 L1.5 18.2 Z M5.2 17 A2.3 2.3 0 1 1 9.8 17 A2.3 2.3 0 1 1 5.2 17 Z M6.61 16.2 L15.61 6.2 L17.39 7.8 L8.39 17.8 Z M14.2 17 A2.3 2.3 0 1 1 18.8 17 A2.3 2.3 0 1 1 14.2 17 Z M16.5 15.8 L22.5 15.8 L22.5 18.2 L16.5 18.2 Z',
    },
  ],
};
