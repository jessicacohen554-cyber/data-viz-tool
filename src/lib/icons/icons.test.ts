/**
 * Icon library tests (docs/ICONS.md §4): every shipped path parses with the
 * allowed commands, stays inside the 24 × 24 box, is centred and carries
 * enough ink; ids are unique; resolution follows the palette rules.
 * `UPDATE_ICON_PREVIEW=1 npx vitest run src/lib/icons` rewrites
 * `public/icons-preview.svg` from the sets.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_COMMANDS, ICON_BOX, measureIcon, parsePath, pathBounds, rasterize, validateIconPath } from './validate';
import { previewSvg } from './preview';
import { DEFAULT_ICON_SET, ICON_SETS, OVERFLOW_ICON_ID, getIconSet, iconSymbol, iconsFor, matchIcon } from './registry';
import type { Icon, IconSet } from './types';

const PREVIEW_PATH = join(__dirname, '..', '..', '..', 'public', 'icons-preview.svg');

function set(id: string): IconSet {
  const s = getIconSet(id);
  if (!s) throw new Error(`missing set ${id}`);
  return s;
}

function inkAt(d: string, x: number, y: number): boolean {
  const { grid, side } = rasterize(d);
  const k = side / ICON_BOX;
  return grid[Math.floor(y * k) * side + Math.floor(x * k)] === 1;
}

describe('path parser', () => {
  it('accepts the absolute command set and splits repeated argument groups', () => {
    const cmds = parsePath('M1 2 L3 4 5 6 H7 V8 C1 1 2 2 3 3 S4 4 5 5 Q6 6 7 7 T8 8 A1 1 0 0 1 2 2 Z');
    expect(cmds.map((c) => c.cmd).join('')).toBe('MLLHVCSQTAZ');
    expect(cmds[1]!.args).toEqual([3, 4]);
    expect(cmds[2]!.args).toEqual([5, 6]);
  });

  it('rejects relative, unknown and malformed commands', () => {
    expect(() => parsePath('m1 2 l3 4 z')).toThrow(/not allowed/);
    expect(() => parsePath('M1 2 X3')).toThrow(/not allowed/);
    expect(() => parsePath('M1 2 L3')).toThrow(/takes 2 arguments/);
    expect(() => parsePath('L1 2 Z')).toThrow(/start with M/);
    expect(() => parsePath('M1 2 L3 4 Z Z1')).toThrow(/takes 0 arguments/);
  });

  it('bounds include curve control points', () => {
    const b = pathBounds('M2 12 Q12 30 22 12 Z');
    expect(b.maxY).toBeGreaterThan(ICON_BOX);
  });
});

describe('path validator', () => {
  it('passes a plain centred square', () => {
    expect(validateIconPath('M3 3 H21 V21 H3 Z')).toEqual([]);
  });

  it('flags a path that leaves the box', () => {
    expect(validateIconPath('M-1 3 H21 V21 H-1 Z').join(' ')).toMatch(/out of bounds/);
  });

  it('flags a hairline', () => {
    expect(validateIconPath('M2 11.6 H22 V12.4 H2 Z').join(' ')).toMatch(/thin share|coverage/);
  });

  it('flags an off-centre or tiny mark', () => {
    expect(validateIconPath('M1 1 H9 V9 H1 Z').join(' ')).toMatch(/off centre/);
    expect(validateIconPath('M10 10 H14 V14 H10 Z').join(' ')).toMatch(/extent/);
  });

  it('rasterises with the nonzero rule: the ring is hollow, the circle is not', () => {
    const basic = set('basic');
    const ring = basic.icons.find((i) => i.id === 'ring')!;
    const circle = basic.icons.find((i) => i.id === 'circle')!;
    expect(inkAt(ring.path, 12, 12)).toBe(false);
    expect(inkAt(ring.path, 12, 3.5)).toBe(true);
    expect(inkAt(circle.path, 12, 12)).toBe(true);
  });
});

describe('shipped sets', () => {
  it('ship the six documented sets with the documented counts, in picker order', () => {
    expect(ICON_SETS.map((s) => [s.id, s.icons.length])).toEqual([
      ['basic', 12], ['power-gen', 14], ['grid', 10], ['weather', 10], ['arrows', 8], ['places', 8],
    ]);
    expect(getIconSet(DEFAULT_ICON_SET)).toBeDefined();
    expect(getIconSet('nope')).toBeUndefined();
  });

  it('set ids are unique and kebab-case; every set names its license', () => {
    const ids = ICON_SETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ICON_SETS) {
      expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.license).toBe('MIT');
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  for (const s of ICON_SETS) {
    describe(`set ${s.id}`, () => {
      it('icon ids are unique and kebab-case; labels and keywords are present', () => {
        const ids = s.icons.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const icon of s.icons) {
          expect(icon.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
          expect(icon.label.length).toBeGreaterThan(0);
          expect(icon.keywords.length).toBeGreaterThan(0);
        }
      });

      for (const icon of s.icons) {
        it(`${icon.id}: parses with ${ALLOWED_COMMANDS} only, stays in the box, is centred and has weight`, () => {
          const cmds = parsePath(icon.path);
          expect(cmds.every((c) => ALLOWED_COMMANDS.includes(c.cmd))).toBe(true);
          const b = pathBounds(icon.path);
          expect(b.minX).toBeGreaterThanOrEqual(0);
          expect(b.minY).toBeGreaterThanOrEqual(0);
          expect(b.maxX).toBeLessThanOrEqual(ICON_BOX);
          expect(b.maxY).toBeLessThanOrEqual(ICON_BOX);
          expect(validateIconPath(icon.path)).toEqual([]);
          expect(measureIcon(icon.path).coverage).toBeGreaterThan(0);
        });
      }
    });
  }
});

describe('iconSymbol', () => {
  it("prefixes the path with 'path://' and nothing else", () => {
    const icon: Icon = { id: 'x', label: 'x', path: 'M3 3 H21 V21 H3 Z', keywords: [] };
    expect(iconSymbol(icon)).toBe('path://M3 3 H21 V21 H3 Z');
  });
});

describe('matchIcon', () => {
  const pg = set('power-gen');
  const idOf = (s: IconSet, label: string) => matchIcon(s, label)?.id;

  it('is case-insensitive and trims', () => {
    expect(idOf(pg, 'Wind')).toBe('wind');
    expect(idOf(pg, 'WIND')).toBe('wind');
    expect(idOf(pg, '  wind ')).toBe('wind');
    expect(idOf(set('weather'), 'SUNNY')).toBe('sun');
  });

  it('maps every ERCOT fuel group of the generation-by-class dataset', () => {
    const expected: Record<string, string> = {
      Gas: 'gas', Coal: 'coal', Wind: 'wind', Solar: 'solar', Hydro: 'hydro',
      Nuclear: 'nuclear', Biomass: 'biomass', Oil: 'oil', Other: 'other',
    };
    for (const [label, id] of Object.entries(expected)) expect(idOf(pg, label), label).toBe(id);
  });

  it('maps every ERCOT unit class by its tokens', () => {
    const expected: Record<string, string> = {
      CC_CHP: 'gas', CC_REGULAR: 'gas', CT_CHP: 'gas', CT_PEAKER: 'gas', ST_CHP: 'gas', ST_GAS: 'gas',
      COAL_LIGNITE: 'coal', COAL_PRB: 'coal', OTHER: 'other', li_ion: 'storage',
      biomass: 'biomass', hydro: 'hydro', nuclear: 'nuclear', oil: 'oil', solar: 'solar', wind: 'wind',
    };
    for (const [label, id] of Object.entries(expected)) expect(idOf(pg, label), label).toBe(id);
  });

  it('prefers the longest keyword run: offshore wind beats wind', () => {
    expect(idOf(pg, 'Offshore Wind')).toBe('offshore-wind');
    expect(idOf(pg, 'Onshore wind')).toBe('wind');
    expect(idOf(pg, 'Combined cycle gas')).toBe('gas');
  });

  it('falls back to a substring match of three or more characters', () => {
    expect(idOf(pg, 'Windfarm-7')).toBe('wind');
    expect(idOf(pg, 'Solaris')).toBe('solar');
  });

  it('returns undefined when nothing matches or the label is blank', () => {
    expect(matchIcon(pg, 'Zebra')).toBeUndefined();
    expect(matchIcon(pg, '')).toBeUndefined();
    expect(matchIcon(set('basic'), 'Nuclear')).toBeUndefined();
  });
});

describe('iconsFor', () => {
  const basic = set('basic');
  const pg = set('power-gen');
  const ids = (m: Record<string, Icon>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.id]));

  it('assigns unmatched labels by position in fixed order', () => {
    expect(ids(iconsFor(basic, ['A', 'B', 'C']))).toEqual({ A: 'circle', B: 'square', C: 'diamond' });
  });

  it('name matches come first and the rest skip the claimed icons', () => {
    const m = ids(iconsFor(pg, ['Zebra', 'Wind', 'Yak', 'Solar']));
    expect(m).toEqual({ Wind: 'wind', Solar: 'solar', Zebra: 'gas', Yak: 'coal' });
  });

  it('overrides win over name matches and positions; an unknown override id is ignored', () => {
    expect(ids(iconsFor(basic, ['A', 'B'], { A: 'star' }))).toEqual({ A: 'star', B: 'circle' });
    expect(ids(iconsFor(pg, ['Wind'], { Wind: 'solar' }))).toEqual({ Wind: 'solar' });
    expect(ids(iconsFor(basic, ['A'], { A: 'not-an-icon' }))).toEqual({ A: 'circle' });
  });

  it('never cycles: labels beyond the set get the other icon when the set has one', () => {
    const labels = Array.from({ length: 16 }, (_, i) => `L${i}`);
    const m = iconsFor(pg, labels);
    const positional = pg.icons.filter((i) => i.id !== OVERFLOW_ICON_ID).map((i) => i.id);
    expect(positional).toHaveLength(13);
    expect(labels.slice(0, 13).map((l) => m[l]!.id)).toEqual(positional);
    expect(labels.slice(13).map((l) => m[l]!.id)).toEqual(['other', 'other', 'other']);
  });

  it('never cycles: labels beyond a set without other are left out', () => {
    const labels = Array.from({ length: 14 }, (_, i) => `L${i}`);
    const m = iconsFor(basic, labels);
    expect(Object.keys(m)).toHaveLength(12);
    expect(m.L12).toBeUndefined();
    expect(m.L13).toBeUndefined();
  });

  it('a repeated label resolves once and two labels may share an icon by name', () => {
    expect(ids(iconsFor(pg, ['Gas', 'Gas', 'CT_PEAKER']))).toEqual({ Gas: 'gas', CT_PEAKER: 'gas' });
  });

  it('does not treat inherited object keys as overrides', () => {
    expect(ids(iconsFor(basic, ['constructor']))).toEqual({ constructor: 'circle' });
  });
});

describe('preview sheet', () => {
  it('public/icons-preview.svg is the current previewSvg() output (UPDATE_ICON_PREVIEW=1 rewrites it)', () => {
    const svg = previewSvg();
    expect(svg).toContain('<svg');
    for (const s of ICON_SETS) for (const i of s.icons) expect(svg).toContain(`d="${i.path}"`);
    if (process.env.UPDATE_ICON_PREVIEW === '1') writeFileSync(PREVIEW_PATH, svg);
    expect(existsSync(PREVIEW_PATH), `missing ${PREVIEW_PATH}`).toBe(true);
    expect(readFileSync(PREVIEW_PATH, 'utf8')).toBe(svg);
  });
});
