/**
 * The `power-gen` icon set (docs/ICONS.md). Generation technologies and fuels; keywords cover the ERCOT fuel groups and unit classes.
 * Every path is hand-authored for this project from straight lines and arcs
 * (clockwise solids, counter-clockwise holes, fill-rule nonzero), licensed
 * MIT; no path is copied from another icon library. Framework-free [R-PURE].
 */
import type { IconSet } from '../types';

/** Power generation: 14 icons in fixed order. */
export const POWER_GEN: IconSet = {
  id: 'power-gen',
  label: 'Power generation',
  description: 'Generation technologies and fuels; keywords cover the ERCOT fuel groups and unit classes.',
  smallSafe: false,
  license: 'MIT',
  icons: [
    {
      id: 'wind',
      label: 'Wind turbine',
      keywords: ['wind', 'onshore', 'wtg', 'turbine'],
      path: 'M10.2 22.5 L11.2 9.8 L12.8 9.8 L13.8 22.5 Z M9.8 9.8 A2.2 2.2 0 1 1 14.2 9.8 A2.2 2.2 0 1 1 9.8 9.8 Z M10.8 9.8 L11.2 0.8 L12.8 0.8 L13.2 9.8 Z M12.6 8.76 L20.19 13.61 L19.39 14.99 L11.4 10.84 Z M12.6 10.84 L4.61 14.99 L3.81 13.61 L11.4 8.76 Z',
    },
    {
      id: 'solar',
      label: 'Solar panel',
      keywords: ['solar', 'pv', 'photovoltaic', 'utility-scale solar', 'rooftop'],
      path: 'M2 3 L8.5 3 L8.5 8.5 L2 8.5 Z M9.5 3 L14.5 3 L14.5 8.5 L9.5 8.5 Z M15.5 3 L22 3 L22 8.5 L15.5 8.5 Z M2 9.5 L8.5 9.5 L8.5 15 L2 15 Z M9.5 9.5 L14.5 9.5 L14.5 15 L9.5 15 Z M15.5 9.5 L22 9.5 L22 15 L15.5 15 Z M11 15 L13 15 L13 20 L11 20 Z M6.5 20 L17.5 20 L17.5 22.5 L6.5 22.5 Z',
    },
    {
      id: 'gas',
      label: 'Gas plant',
      keywords: ['gas', 'natural gas', 'ng', 'cc', 'ct', 'st', 'ccgt', 'ocgt', 'combined cycle', 'combustion turbine', 'steam', 'peaker', 'chp', 'regular', 'lng', 'methane'],
      path: 'M2 13 L17 13 L17 22.5 L2 22.5 Z M17 8.5 L21 8.5 L21 22.5 L17 22.5 Z M19 1 C20.8 3 22 4.4 22 5.8 C22 7.4 20.6 8.6 19 8.6 C17.4 8.6 16 7.4 16 5.8 C16 4.4 17.2 3 19 1 Z',
    },
    {
      id: 'coal',
      label: 'Coal plant',
      keywords: ['coal', 'lignite', 'prb', 'anthracite', 'bituminous', 'thermal'],
      path: 'M2 13 L16 13 L16 22.5 L2 22.5 Z M16 8 L20 8 L20 22.5 L16 22.5 Z M14.5 4.6 A2.7 2.7 0 1 1 19.9 4.6 A2.7 2.7 0 1 1 14.5 4.6 Z M18.5 3.1 A2.4 2.4 0 1 1 23.3 3.1 A2.4 2.4 0 1 1 18.5 3.1 Z',
    },
    {
      id: 'nuclear',
      label: 'Nuclear',
      keywords: ['nuclear', 'nuc', 'atomic', 'uranium', 'reactor', 'smr', 'fission'],
      path: 'M9.7 12 A2.3 2.3 0 1 1 14.3 12 A2.3 2.3 0 1 1 9.7 12 Z M6.5 2.47 A11 11 0 0 1 17.5 2.47 L14 8.54 A4 4 0 0 0 10 8.54 Z M23 12 A11 11 0 0 1 17.5 21.53 L14 15.46 A4 4 0 0 0 16 12 Z M6.5 21.53 A11 11 0 0 1 1 12 L8 12 A4 4 0 0 0 10 15.46 Z',
    },
    {
      id: 'hydro',
      label: 'Hydro',
      keywords: ['hydro', 'hydroelectric', 'water', 'dam', 'river', 'pumped', 'psh', 'run-of-river'],
      path: 'M2 2 L8 2 L11 22 L2 22 Z M11 9.5 Q14 7.5 17 9.5 T23 9.5 V12.7 Q20 14.7 17 12.7 T11 12.7 Z M11 16 Q14 14 17 16 T23 16 V19.2 Q20 21.2 17 19.2 T11 19.2 Z',
    },
    {
      id: 'storage',
      label: 'Battery storage',
      keywords: ['battery', 'storage', 'bess', 'li', 'ion', 'li_ion', 'li-ion', 'lithium', 'ess', 'esr', 'flywheel'],
      path: 'M2 7 L19 7 L19 17 L2 17 Z M19 10 L22 10 L22 14 L19 14 Z M4 15 L17 15 L17 9 L4 9 Z M5.5 10.5 L10 10.5 L10 13.5 L5.5 13.5 Z M11 10.5 L15.5 10.5 L15.5 13.5 L11 13.5 Z',
    },
    {
      id: 'geothermal',
      label: 'Geothermal',
      keywords: ['geothermal', 'geo', 'heat', 'steam field'],
      path: 'M2.5 22.5 A9.5 9.5 0 0 1 21.5 22.5 Z M5.8 12.5 Q7.8 9.88 5.8 7.25 Q3.8 4.63 5.8 2 H8.2 Q6.2 4.63 8.2 7.25 Q10.2 9.88 8.2 12.5 Z M10.8 12.5 Q12.8 9.88 10.8 7.25 Q8.8 4.63 10.8 2 H13.2 Q11.2 4.63 13.2 7.25 Q15.2 9.88 13.2 12.5 Z M15.8 12.5 Q17.8 9.88 15.8 7.25 Q13.8 4.63 15.8 2 H18.2 Q16.2 4.63 18.2 7.25 Q20.2 9.88 18.2 12.5 Z',
    },
    {
      id: 'biomass',
      label: 'Biomass',
      keywords: ['biomass', 'bio', 'wood', 'biogas', 'landfill', 'waste', 'leaf', 'renewable'],
      path: 'M3 21 C3 10 9 3 21 3 C21 15 15 21 3 21 Z M5.49 19.49 L17.99 6.99 L17.01 6.01 L4.51 18.51 Z',
    },
    {
      id: 'oil',
      label: 'Oil',
      keywords: ['oil', 'petroleum', 'diesel', 'fuel oil', 'crude', 'distillate', 'drop'],
      path: 'M12 1.5 C12 1.5 19.5 10 19.5 15 A7.5 7.5 0 0 1 4.5 15 C4.5 10 12 1.5 12 1.5 Z',
    },
    {
      id: 'hydrogen',
      label: 'Hydrogen',
      keywords: ['hydrogen', 'h2', 'electrolyser', 'electrolyzer', 'fuel cell'],
      path: 'M5 2 H19 A3 3 0 0 1 22 5 V19 A3 3 0 0 1 19 22 H5 A3 3 0 0 1 2 19 V5 A3 3 0 0 1 5 2 Z M5.5 18 L8.1 18 L8.1 6 L5.5 6 Z M11 18 L13.6 18 L13.6 6 L11 6 Z M8.1 13.2 L11 13.2 L11 10.8 L8.1 10.8 Z M15.5 16 L18.5 16 L18.5 13 L15.5 13 Z',
    },
    {
      id: 'ccs',
      label: 'Carbon capture',
      keywords: ['ccs', 'ccus', 'capture', 'carbon', 'co2', 'sequestration', 'abated'],
      path: 'M3 10 L6 10 L6 22 L3 22 Z M18 10 L21 10 L21 22 L18 22 Z M3 19 L21 19 L21 22 L3 22 Z M13.5 1.5 L13.5 11 L10.5 11 L10.5 1.5 Z M17.5 10.5 L12 17 L6.5 10.5 Z',
    },
    {
      id: 'offshore-wind',
      label: 'Offshore wind',
      keywords: ['offshore wind', 'offshore', 'osw', 'floating wind', 'marine'],
      path: 'M10.2 17 L11.2 8 L12.8 8 L13.8 17 Z M10.1 8 A1.9 1.9 0 1 1 13.9 8 A1.9 1.9 0 1 1 10.1 8 Z M10.9 8 L11.25 1.5 L12.75 1.5 L13.1 8 Z M12.55 7.05 L18 10.6 L17.25 11.9 L11.45 8.95 Z M12.55 8.95 L6.75 11.9 L6 10.6 L11.45 7.05 Z M1 18 Q3.75 16 6.5 18 T12 18 T17.5 18 T23 18 V21.2 Q20.25 23.2 17.5 21.2 T12 21.2 T6.5 21.2 T1 21.2 Z',
    },
    {
      id: 'other',
      label: 'Other plant',
      keywords: ['other', 'misc', 'unknown', 'plant', 'generic', 'mixed', 'na'],
      path: 'M2 11 L15 11 L15 22.5 L2 22.5 Z M16 3 L20 3 L20 22.5 L16 22.5 Z M7 22.5 L10 22.5 L10 16 L7 16 Z',
    },
  ],
};
