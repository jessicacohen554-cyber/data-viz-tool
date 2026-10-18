import { describe, expect, it } from 'vitest';
import {
  CATEGORICAL_DEFS, ISO_COLORS, OBSERVATORY_COLORS, OTHER_COLOR, OVERFLOW_COLOR, assignColors, isoShare, labelTokens,
  matchObservatory, matchShare,
} from './categorical';
import { hexToOklch } from './sequential';

describe('categorical sets (§1)', () => {
  it('lists the thirteen §1 ids in picker order, then the §6 family sets', () => {
    expect(CATEGORICAL_DEFS.map((d) => d.id)).toEqual([
      'observatory', 'observatory-iso', 'okabe-ito', 'classic-10',
      'pairs-amber-indigo', 'pairs-sky-orange', 'pairs-green-magenta', 'pairs-teal-brown', 'pairs-navy-gold', 'pairs-purple-lime',
      'pastel', 'bold', 'grayscale',
      'neon', 'vibrant', 'muted', 'earthy', 'ocean', 'sunset', 'forest', 'berry', 'candy', 'retro', 'corporate', 'warm', 'cool', 'high-contrast',
      'monochrome-navy', 'monochrome-teal',
    ]);
  });
  it('pastel is the band wheel at OKLCH L 0.85', () => {
    const pastel = CATEGORICAL_DEFS.find((d) => d.id === 'pastel')!.colors;
    expect(pastel).toHaveLength(10);
    for (const hex of pastel) expect(hexToOklch(hex)[0]).toBeCloseTo(0.85, 1);
  });
  it('observatory holds the twelve entity colors in slot order', () => {
    expect(OBSERVATORY_COLORS).toEqual(['#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#6B7280', '#374151', '#E67E22', '#26A69A', '#10B981', '#92400E', '#D97706', '#009688']);
  });
  it('bold is the ten Observatory hues at L 0.55', () => {
    const bold = CATEGORICAL_DEFS.find((d) => d.id === 'bold')!.colors;
    expect(bold).toHaveLength(10);
    bold.forEach((hex, i) => {
      const [L, , h] = hexToOklch(hex);
      expect(L).toBeCloseTo(0.55, 1);
      let d = Math.abs(h - hexToOklch(OBSERVATORY_COLORS[i]!)[2]); if (d > 180) d = 360 - d;
      expect(d).toBeLessThan(3);
    });
  });
  it('grayscale is six neutral steps at the listed lightness', () => {
    const gray = CATEGORICAL_DEFS.find((d) => d.id === 'grayscale')!.colors;
    expect(gray.map((c) => +hexToOklch(c)[0].toFixed(2))).toEqual([0.86, 0.74, 0.62, 0.5, 0.38, 0.25]);
    for (const c of gray) expect(hexToOklch(c)[1]).toBeLessThan(0.005);
  });
  it('every pair set has exactly two colors', () => {
    for (const d of CATEGORICAL_DEFS.filter((x) => x.id.startsWith('pairs-'))) expect(d.colors).toHaveLength(2);
  });
});

describe('Observatory name matching (§3)', () => {
  it('tokenizes on non-alphanumerics, lower-cased', () => {
    expect(labelTokens('Li_Ion-Battery (BESS)')).toEqual(['li', 'ion', 'battery', 'bess']);
  });
  const cases: Array<[string, string, string]> = [
    ['Offshore Wind', '#009688', 'offshore'],
    ['Hydrogen', '#10B981', 'hydrogen'],
    ['Biomass', '#10B981', 'hydrogen'],
    ['geothermal', '#D97706', 'geothermal'],
    ['Solar PV', '#F59E0B', 'solar'],
    ['PV', '#F59E0B', 'solar'],
    ['wind', '#22C55E', 'wind'],
    ['Nuclear', '#6366F1', 'nuclear'],
    ['hydro', '#0EA5E9', 'hydro'],
    ['Hydroelectric', '#0EA5E9', 'hydro'],
    ['Battery Storage', '#E67E22', 'storage'],
    ['li_ion', '#E67E22', 'storage'],
    ['BESS', '#E67E22', 'storage'],
    ['Coal', '#374151', 'fossil-coal'],
    ['Lignite', '#374151', 'fossil-coal'],
    ['Gas', '#6B7280', 'fossil-gas'],
    ['CC', '#6B7280', 'fossil-gas'],
    ['CT', '#6B7280', 'fossil-gas'],
    ['NG', '#6B7280', 'fossil-gas'],
    ['CCGT', '#6B7280', 'fossil-gas'],
    ['Gas CCS', '#26A69A', 'ccs'],
    ['ccs', '#26A69A', 'ccs'],
    ['oil', '#92400E', 'oil'],
    ['Diesel', '#92400E', 'oil'],
    ['ERCOT', '#22C55E', 'iso'],
    ['caiso', '#F59E0B', 'iso'],
    ['ISO-NE', '#9C27B0', 'iso'],
    ['ISONE', '#9C27B0', 'iso'],
    ['NEISO', '#9C27B0', 'iso'],
    ['OTHER', OTHER_COLOR, 'other'],
    ['unknown', OTHER_COLOR, 'other'],
    ['Misc', OTHER_COLOR, 'other'],
  ];
  for (const [label, color, token] of cases) {
    it(`${label} → ${token}`, () => expect(matchObservatory(label)).toEqual({ color, token }));
  }
  it('hydrogen never matches hydro; ccs wins over cc; account never matches gas', () => {
    expect(matchObservatory('hydrogen')?.token).toBe('hydrogen');
    expect(matchObservatory('CCS')?.token).toBe('ccs');
    expect(matchObservatory('account')).toBeUndefined();
    expect(matchObservatory('contact')).toBeUndefined(); // "ct" inside a word is not a token
    expect(matchObservatory('Houston')).toBeUndefined();
    expect(matchObservatory('')).toBeUndefined();
  });
  it('ERCOT fuel_group values all resolve; zone values do not', () => {
    const fuels = ['Gas', 'Coal', 'wind', 'solar', 'hydro', 'nuclear', 'biomass', 'oil', 'OTHER'];
    expect(matchShare(fuels)).toBe(1);
    expect(matchObservatory('OTHER')?.color).toBe(OTHER_COLOR);
    expect(matchShare(['HOUSTON', 'NORTH', 'SOUTH', 'WEST'])).toBe(0);
    expect(matchShare([])).toBe(0);
  });
  it('isoShare counts ISO tokens only', () => {
    expect(isoShare(['ERCOT', 'PJM', 'Solar', 'Houston'])).toBe(0.5);
    expect(Object.keys(ISO_COLORS)).toContain('nwpp');
  });
});

describe('assignColors', () => {
  const colors = ['#A', '#B', '#C'];
  it('fixed order, never cycled; overflow is the border color', () => {
    const m = assignColors(['x', 'y', 'z', 'w'], colors, false);
    expect([...m.entries()]).toEqual([['x', '#A'], ['y', '#B'], ['z', '#C'], ['w', OVERFLOW_COLOR]]);
  });
  it('matched labels take their entity color; the rest take remaining hues in order', () => {
    const m = assignColors(['Zebra', 'wind', 'Apple'], OBSERVATORY_COLORS, true);
    expect(m.get('wind')).toBe('#22C55E');
    expect(m.get('Zebra')).toBe('#F59E0B');
    expect(m.get('Apple')).toBe('#0EA5E9'); // #22C55E is taken by wind
  });
  it('extends a prior assignment without repainting', () => {
    const m = assignColors(['a', 'b'], colors, false);
    assignColors(['b', 'c'], colors, false, m);
    expect(m.get('a')).toBe('#A');
    expect(m.get('b')).toBe('#B');
    expect(m.get('c')).toBe('#C');
  });
});
