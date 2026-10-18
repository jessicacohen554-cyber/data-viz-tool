/**
 * The §7 validation report: the generated block in docs/PALETTES.md must
 * equal a fresh render (results are re-run, never re-typed), and the tables
 * carry one row per palette.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTES, PALETTE_FAMILIES, palettesOfKind } from './registry';
import { REPORT_BEGIN, REPORT_END, categoricalTable, extractReport, familyTable, rampTable, rampVerdict, renderValidationReport } from './report';

const DOC = join(__dirname, '..', '..', '..', 'docs', 'PALETTES.md');

describe('validation report (§7)', () => {
  it('renders one row per palette and per family', () => {
    const lines = (t: string): number => t.split('\n').length - 2;
    expect(lines(categoricalTable(PALETTES))).toBe(palettesOfKind('categorical').length);
    expect(lines(rampTable(PALETTES))).toBe(palettesOfKind('sequential').length + palettesOfKind('diverging').length);
    expect(lines(familyTable(PALETTES, PALETTE_FAMILIES))).toBe(PALETTE_FAMILIES.length);
  });
  it('verdicts: diverging ramps pass on their arms; the heat ramp is exempt; single-hue ramps pass', () => {
    for (const p of palettesOfKind('diverging')) expect(rampVerdict(p), p.id).toBe('arms pass');
    expect(rampVerdict(PALETTES.find((p) => p.id === 'seq-observatory-heat')!)).toBe('exempt (parity)');
    for (const p of palettesOfKind('sequential').filter((x) => x.tags.includes('single-hue'))) expect(rampVerdict(p), p.id).toBe('passes');
  });
  it('the report is wrapped in its markers and extractReport finds it', () => {
    const r = renderValidationReport(PALETTES, PALETTE_FAMILIES);
    expect(r.startsWith(REPORT_BEGIN)).toBe(true);
    expect(r.endsWith(REPORT_END)).toBe(true);
    expect(extractReport(`intro\n${r}\noutro`)).toBe(r);
    expect(extractReport('no markers')).toBeNull();
  });
  it('docs/PALETTES.md carries the current report verbatim (regenerate with `node scripts/validate_palette.js --all`)', () => {
    const doc = readFileSync(DOC, 'utf8');
    const pasted = extractReport(doc);
    expect(pasted, 'markers missing from PALETTES.md').not.toBeNull();
    expect(pasted).toBe(renderValidationReport(PALETTES, PALETTE_FAMILIES));
  });
});
