/**
 * The `weather` icon set (docs/ICONS.md). Weather conditions for load, price and renewable-output stories.
 * Every path is hand-authored for this project from straight lines and arcs
 * (clockwise solids, counter-clockwise holes, fill-rule nonzero), licensed
 * MIT; no path is copied from another icon library. Framework-free [R-PURE].
 */
import type { IconSet } from '../types';

/** Weather: 10 icons in fixed order. */
export const WEATHER: IconSet = {
  id: 'weather',
  label: 'Weather',
  description: 'Weather conditions for load, price and renewable-output stories.',
  smallSafe: false,
  license: 'MIT',
  icons: [
    {
      id: 'sun',
      label: 'Sun',
      keywords: ['sun', 'sunny', 'clear', 'fair', 'irradiance', 'ghi', 'day'],
      path: 'M6.8 12 A5.2 5.2 0 1 1 17.2 12 A5.2 5.2 0 1 1 6.8 12 Z M19.6 10.85 L22.8 10.85 L22.8 13.15 L19.6 13.15 Z M18.19 16.56 L20.45 18.82 L18.82 20.45 L16.56 18.19 Z M13.15 19.6 L13.15 22.8 L10.85 22.8 L10.85 19.6 Z M7.44 18.19 L5.18 20.45 L3.55 18.82 L5.81 16.56 Z M4.4 13.15 L1.2 13.15 L1.2 10.85 L4.4 10.85 Z M5.81 7.44 L3.55 5.18 L5.18 3.55 L7.44 5.81 Z M10.85 4.4 L10.85 1.2 L13.15 1.2 L13.15 4.4 Z M16.56 5.81 L18.82 3.55 L20.45 5.18 L18.19 7.44 Z',
    },
    {
      id: 'cloud',
      label: 'Cloud',
      keywords: ['cloud', 'cloudy', 'overcast', 'partly'],
      path: 'M3 14 A5 5 0 1 1 13 14 A5 5 0 1 1 3 14 Z M7.5 10.5 A6 6 0 1 1 19.5 10.5 A6 6 0 1 1 7.5 10.5 Z M13.5 14.5 A4.5 4.5 0 1 1 22.5 14.5 A4.5 4.5 0 1 1 13.5 14.5 Z M8 14.5 L18 14.5 L18 19 L8 19 Z',
    },
    {
      id: 'rain',
      label: 'Rain',
      keywords: ['rain', 'rainy', 'shower', 'drizzle', 'precipitation', 'wet'],
      path: 'M4 10 A4 4 0 1 1 12 10 A4 4 0 1 1 4 10 Z M8 7.5 A5 5 0 1 1 18 7.5 A5 5 0 1 1 8 7.5 Z M14 10.5 A3.5 3.5 0 1 1 21 10.5 A3.5 3.5 0 1 1 14 10.5 Z M8 10.5 L17.5 10.5 L17.5 14 L8 14 Z M8.06 16.29 L6.56 21.79 L4.44 21.21 L5.94 15.71 Z M13.06 16.29 L11.56 21.79 L9.44 21.21 L10.94 15.71 Z M18.06 16.29 L16.56 21.79 L14.44 21.21 L15.94 15.71 Z',
    },
    {
      id: 'snow',
      label: 'Snow',
      keywords: ['snow', 'snowy', 'sleet', 'ice', 'freezing', 'blizzard', 'flake'],
      path: 'M21.5 13.1 L2.5 13.1 L2.5 10.9 L21.5 10.9 Z M15.8 20.78 L6.3 4.32 L8.2 3.22 L17.7 19.68 Z M6.3 19.68 L15.8 3.22 L17.7 4.32 L8.2 20.78 Z M19.5 12 A1.8 1.8 0 1 1 23.1 12 A1.8 1.8 0 1 1 19.5 12 Z M14.85 20.05 A1.8 1.8 0 1 1 18.45 20.05 A1.8 1.8 0 1 1 14.85 20.05 Z M5.55 20.05 A1.8 1.8 0 1 1 9.15 20.05 A1.8 1.8 0 1 1 5.55 20.05 Z M0.9 12 A1.8 1.8 0 1 1 4.5 12 A1.8 1.8 0 1 1 0.9 12 Z M5.55 3.95 A1.8 1.8 0 1 1 9.15 3.95 A1.8 1.8 0 1 1 5.55 3.95 Z M14.85 3.95 A1.8 1.8 0 1 1 18.45 3.95 A1.8 1.8 0 1 1 14.85 3.95 Z',
    },
    {
      id: 'wind',
      label: 'Wind',
      keywords: ['wind', 'windy', 'breeze', 'gust', 'gale', 'speed'],
      path: 'M3.4 5.2 H14.6 A1.4 1.4 0 0 1 16 6.6 V6.6 A1.4 1.4 0 0 1 14.6 8 H3.4 A1.4 1.4 0 0 1 2 6.6 V6.6 A1.4 1.4 0 0 1 3.4 5.2 Z M16 8 A3.7 3.7 0 1 1 19.7 4.3 L16.9 4.3 A0.9 0.9 0 1 0 16 5.2 Z M3.4 11 H16.6 A1.4 1.4 0 0 1 18 12.4 V12.4 A1.4 1.4 0 0 1 16.6 13.8 H3.4 A1.4 1.4 0 0 1 2 12.4 V12.4 A1.4 1.4 0 0 1 3.4 11 Z M18 11 A3.7 3.7 0 1 1 14.3 14.7 L17.1 14.7 A0.9 0.9 0 1 0 18 13.8 Z M3.4 16.8 H10.6 A1.4 1.4 0 0 1 12 18.2 V18.2 A1.4 1.4 0 0 1 10.6 19.6 H3.4 A1.4 1.4 0 0 1 2 18.2 V18.2 A1.4 1.4 0 0 1 3.4 16.8 Z',
    },
    {
      id: 'storm',
      label: 'Storm',
      keywords: ['storm', 'thunder', 'lightning', 'thunderstorm', 'severe', 'hurricane', 'tornado'],
      path: 'M4 10 A4 4 0 1 1 12 10 A4 4 0 1 1 4 10 Z M8 7.5 A5 5 0 1 1 18 7.5 A5 5 0 1 1 8 7.5 Z M14 10.5 A3.5 3.5 0 1 1 21 10.5 A3.5 3.5 0 1 1 14 10.5 Z M8 10.5 L17.5 10.5 L17.5 14 L8 14 Z M14.8 12 L12.9 16.2 L16.5 16.2 L10.4 23.3 L11.6 18.2 L8 18.2 L13.4 12 Z',
    },
    {
      id: 'hot',
      label: 'Hot',
      keywords: ['hot', 'heat', 'heatwave', 'warm', 'high temperature', 'summer', 'temp high'],
      path: 'M9 1.5 H9 A2.5 2.5 0 0 1 11.5 4 V14.5 A2.5 2.5 0 0 1 9 17 H9 A2.5 2.5 0 0 1 6.5 14.5 V4 A2.5 2.5 0 0 1 9 1.5 Z M4.8 18.5 A4.2 4.2 0 1 1 13.2 18.5 A4.2 4.2 0 1 1 4.8 18.5 Z M16 6 A2.5 2.5 0 1 1 21 6 A2.5 2.5 0 1 1 16 6 Z M21.58 7.73 L23.34 9.5 L22 10.84 L20.23 9.08 Z M16.77 9.08 L15 10.84 L13.66 9.5 L15.42 7.73 Z M15.42 4.27 L13.66 2.5 L15 1.16 L16.77 2.92 Z M20.23 2.92 L22 1.16 L23.34 2.5 L21.58 4.27 Z',
    },
    {
      id: 'cold',
      label: 'Cold',
      keywords: ['cold', 'freeze', 'frost', 'chill', 'low temperature', 'winter', 'temp low'],
      path: 'M9 1.5 H9 A2.5 2.5 0 0 1 11.5 4 V14.5 A2.5 2.5 0 0 1 9 17 H9 A2.5 2.5 0 0 1 6.5 14.5 V4 A2.5 2.5 0 0 1 9 1.5 Z M4.8 18.5 A4.2 4.2 0 1 1 13.2 18.5 A4.2 4.2 0 1 1 4.8 18.5 Z M9 3 A1 1 0 0 0 8 4 V12.5 A1 1 0 0 0 9 13.5 H9 A1 1 0 0 0 10 12.5 V4 A1 1 0 0 0 9 3 Z M22.7 7.9 L14.3 7.9 L14.3 6.1 L22.7 6.1 Z M19.82 11.09 L15.62 3.81 L17.18 2.91 L21.38 10.19 Z M15.62 10.19 L19.82 2.91 L21.38 3.81 L17.18 11.09 Z',
    },
    {
      id: 'fog',
      label: 'Fog',
      keywords: ['fog', 'foggy', 'mist', 'haze', 'hazy', 'smog'],
      path: 'M4.5 8 A4.5 4.5 0 1 1 13.5 8 A4.5 4.5 0 1 1 4.5 8 Z M9.5 6.5 A5 5 0 1 1 19.5 6.5 A5 5 0 1 1 9.5 6.5 Z M15.3 9.5 A3.2 3.2 0 1 1 21.7 9.5 A3.2 3.2 0 1 1 15.3 9.5 Z M9 9 L18.5 9 L18.5 12.5 L9 12.5 Z M4.3 13.8 H19.7 A1.3 1.3 0 0 1 21 15.1 V15.1 A1.3 1.3 0 0 1 19.7 16.4 H4.3 A1.3 1.3 0 0 1 3 15.1 V15.1 A1.3 1.3 0 0 1 4.3 13.8 Z M7.3 18.4 H19.7 A1.3 1.3 0 0 1 21 19.7 V19.7 A1.3 1.3 0 0 1 19.7 21 H7.3 A1.3 1.3 0 0 1 6 19.7 V19.7 A1.3 1.3 0 0 1 7.3 18.4 Z',
    },
    {
      id: 'moon',
      label: 'Moon',
      keywords: ['moon', 'night', 'clear night', 'dark', 'evening'],
      path: 'M19.74 20.19 A10 10 0 1 1 19.74 3.81 A9 9 0 0 0 19.74 20.19 Z',
    },
  ],
};
