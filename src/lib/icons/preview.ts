/**
 * Builds `public/icons-preview.svg` (docs/ICONS.md §5): one SVG grid of every
 * shipped icon, each drawn at 32 px and again at 12 px beside its id, one
 * band per set. Pure string building; `icons.test.ts` keeps the committed
 * file equal to this output. Framework-free [R-PURE].
 */
import { ICON_SETS } from './registry';
import { ICON_BOX } from './validate';

const COLS = 8;
const CELL_W = 96;
const CELL_H = 72;
const BAND_HEADER = 36;
const BAND_GAP = 16;
const MARGIN = 16;
const LARGE = 32;
const SMALL = 12;
const INK = '#1F2937';
const MUTED = '#6B7280';
const PAPER = '#FFFFFF';
const RULE = '#D4D8E0';
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The preview sheet as an SVG document string. */
export function previewSvg(): string {
  const width = MARGIN * 2 + COLS * CELL_W;
  const bands: string[] = [];
  let y = MARGIN;
  for (const set of ICON_SETS) {
    const rows = Math.ceil(set.icons.length / COLS);
    const bandH = BAND_HEADER + rows * CELL_H;
    const parts: string[] = [];
    parts.push(`<text x="${MARGIN}" y="${y + 20}" font-size="15" font-weight="600" fill="${INK}">${esc(set.label)}</text>`);
    parts.push(`<text x="${MARGIN + 8 * set.label.length + 24}" y="${y + 20}" font-size="12" fill="${MUTED}">${esc(`${set.id} · ${set.icons.length} icons · ${set.smallSafe ? 'small-safe' : 'use at ≥ 16 px'}`)}</text>`);
    parts.push(`<line x1="${MARGIN}" y1="${y + 28}" x2="${width - MARGIN}" y2="${y + 28}" stroke="${RULE}" stroke-width="1"/>`);
    set.icons.forEach((icon, i) => {
      const cx = MARGIN + (i % COLS) * CELL_W;
      const cy = y + BAND_HEADER + Math.floor(i / COLS) * CELL_H;
      const k = LARGE / ICON_BOX;
      const s = SMALL / ICON_BOX;
      parts.push(`<g transform="translate(${cx + 8} ${cy + 6}) scale(${k})"><path d="${esc(icon.path)}" fill="${INK}"/></g>`);
      parts.push(`<g transform="translate(${cx + 8 + LARGE + 10} ${cy + 6 + LARGE - SMALL}) scale(${s})"><path d="${esc(icon.path)}" fill="${INK}"/></g>`);
      parts.push(`<text x="${cx + 8}" y="${cy + 6 + LARGE + 16}" font-size="11" fill="${MUTED}">${esc(icon.id)}</text>`);
    });
    bands.push(parts.join('\n'));
    y += bandH + BAND_GAP;
  }
  const height = y + MARGIN - BAND_GAP;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`,
    `<title>Icon sets preview</title>`,
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
    ...bands,
    `</svg>`,
    '',
  ].join('\n');
}
