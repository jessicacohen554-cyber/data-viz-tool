/**
 * Palette validator — port of the dataviz skill's `validate_palette.js`
 * (thresholds unchanged; docs/PALETTES.md §5). Plain ES module, no
 * dependencies, so it runs as a CLI and imports into Vitest and into
 * `src/lib/palette/validate.ts` (typed by `validate_palette.d.ts`).
 *
 * Checks measurable from hexes alone:
 *   Lightness band      OKLCH L within the mode's band
 *   Chroma floor        OKLCH C ≥ 0.10 (below it a hue reads as gray)
 *   CVD separation      OKLab ΔE×100 on adjacent pairs under Machado 2009
 *                       protan/deutan at severity 1.0 (≥ 8 pass, 6–8 warn)
 *   Normal-vision floor worst adjacent pair ΔE×100 ≥ 15 unsimulated (hard)
 *   Contrast vs surface WCAG ≥ 3:1 per mark (below = "relief": labels needed)
 * `validateOrdinal` checks a stepped ramp: monotone L, adjacent ΔL ≥ 0.06,
 * lightest step ≥ 2:1 vs surface, one hue (spread ≤ 40°).
 *
 * Usage:
 *   node scripts/validate_palette.js "#F59E0B,#22C55E,#0EA5E9" --mode light
 *   node scripts/validate_palette.js "<hex,...>" --surface "#FFFFFF" --pairs all
 *   node scripts/validate_palette.js "<hex,...>" --ordinal
 * Exit 0 unless a check hard-FAILs (1); 2 on bad input.
 */

// -- thresholds ----------------------------------------------------------------
/** OKLCH lightness band per mode. */
export const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };
/** OKLCH chroma floor. */
export const CHROMA_FLOOR = 0.10;
/** OKLab ΔE×100 under protan/deutan: target (pass) and floor (warn band). */
export const CVD_TARGET = 8.0;
export const CVD_FLOOR = 6.0;
/** OKLab ΔE×100 unsimulated, worst pair on the active pairlist. */
export const NORMAL_FLOOR = 15.0;
/** WCAG contrast of a mark against the surface. */
export const CONTRAST_MIN = 3.0;
/** Observatory surfaces: the page (`--surface`) and cards. */
export const DEFAULT_SURFACE = { light: '#F8F9FC', dark: '#1A2744' };
/** Stepped ramps: min OKLCH ΔL between adjacent steps; lightest step contrast floor. */
export const ORDINAL_MIN_DL = 0.06;
export const ORDINAL_LIGHT_FLOOR = 2.0;
/** Stepped ramps: max OKLCH hue spread (°) for a one-hue ramp. */
export const ORDINAL_HUE_SPREAD = 40;

// Machado, Oliveira & Fernandes (2009) CVD transforms at severity 1.0 (linear RGB).
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

// -- input boundary ---------------------------------------------------------------
const WS_RUN = '[ \\t\\n\\v\\f\\r\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+';
const stripWs = (v) => v.replace(new RegExp(`^${WS_RUN}|${WS_RUN}$`, 'g'), '');
/** Splits a comma-separated hex list, trimming each entry. */
export const splitColors = (raw) => (raw || '').split(',').map(stripWs).filter(Boolean);
/** True for `#rrggbb` (the `#` optional). */
export const isHexColor = (v) => /^#?[0-9a-fA-F]{6}$/.test(v);

// -- color conversions ------------------------------------------------------------
const hex2srgb = (h) => { h = h.trim().replace(/^#/, ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (h) => hex2srgb(h).map(s2lin);
const relLum = (h) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** WCAG 2.x contrast ratio between two hex colors. */
export const contrast = (a, b) => { const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

function oklabFromLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
/** OKLab `[L, a, b]` of a hex color. */
export const oklab = (h) => oklabFromLin(lin(h));
/** OKLCH `[L, C, h°]` of a hex color (hue in [0, 360)). */
export const oklch = (h) => { const [L, a, b] = oklab(h); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180 / Math.PI) % 360 + 360) % 360]; };

function simulate(h, kind) {
  const [r, g, b] = lin(h); const M = MACHADO[kind];
  const clamp = (c) => Math.max(0, Math.min(1, c));
  return [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ];
}

/** OKLab ΔE×100 between two hexes; `kind` = `protan` | `deutan` | `tritan` | undefined (normal vision). */
export function deltaE(h1, h2, kind) {
  const a = oklabFromLin(kind ? simulate(h1, kind) : lin(h1));
  const b = oklabFromLin(kind ? simulate(h2, kind) : lin(h2));
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// -- checks -------------------------------------------------------------------------
/**
 * Categorical checks. Returns `{ report, ok, metrics }`; `report` rows are
 * `[name, state, detail]` where state is a boolean or `pass|floor|fail|relief`.
 */
export function validate(palette, { mode = 'light', surface, pairs = 'adjacent' } = {}) {
  surface ??= DEFAULT_SURFACE[mode];
  const [lo, hi] = BAND[mode];
  const report = [];
  let ok = true;

  const offband = palette.filter((c) => { const L = oklch(c)[0]; return L < lo || L > hi; });
  if (offband.length) ok = false;
  report.push(['Lightness band', !offband.length,
    offband.length ? `outside band: ${JSON.stringify(offband.map((c) => [c, +oklch(c)[0].toFixed(3)]))}` : `all ${palette.length} inside L ${lo}–${hi}`]);

  const lowc = palette.filter((c) => oklch(c)[1] < CHROMA_FLOOR);
  if (lowc.length) ok = false;
  report.push(['Chroma floor', !lowc.length,
    lowc.length ? `below floor (reads gray): ${JSON.stringify(lowc.map((c) => [c, +oklch(c)[1].toFixed(3)]))}` : `all ${palette.length} >= ${CHROMA_FLOOR}`]);

  const n = palette.length;
  const pairlist = pairs === 'all'
    ? Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + 1 + k])).flat()
    : Array.from({ length: Math.max(0, n - 1) }, (_, i) => [i, i + 1]);
  const label = pairs === 'all' ? 'all-pairs' : 'adjacent';
  let worst = null;
  for (const kind of ['protan', 'deutan']) {
    for (const [i, j] of pairlist) {
      const d = deltaE(palette[i], palette[j], kind);
      if (worst === null || d < worst[0]) worst = [d, kind, palette[i], palette[j]];
    }
  }
  const tri = pairlist.length ? Math.min(...pairlist.map(([i, j]) => deltaE(palette[i], palette[j], 'tritan'))) : 99;
  const wd = worst ? worst[0] : 99;
  const cvdState = wd >= CVD_TARGET ? 'pass' : wd >= CVD_FLOOR ? 'floor' : 'fail';
  if (cvdState === 'fail') ok = false;
  report.push(['CVD separation', cvdState,
    worst ? `worst ${label} ${worst[3]}↔${worst[2]} ΔE ${wd.toFixed(1)} (${worst[1]}) · tritan ${tri.toFixed(1)}` : 'n/a']);

  let nworst = null;
  for (const [i, j] of pairlist) {
    const d = deltaE(palette[i], palette[j]);
    if (nworst === null || d < nworst[0]) nworst = [d, palette[i], palette[j]];
  }
  const nd = nworst ? nworst[0] : 99;
  const norState = nd >= NORMAL_FLOOR ? 'pass' : 'fail';
  if (norState === 'fail') ok = false;
  report.push(['Normal-vision floor', norState,
    nworst ? `worst ${label} ${nworst[2]}↔${nworst[1]} ΔE ${nd.toFixed(1)} (normal)`
      + (nd >= NORMAL_FLOOR ? '' : ` — below ${NORMAL_FLOOR.toFixed(0)}, hard to tell apart even with full color vision`) : 'n/a']);

  const low = palette.filter((c) => contrast(c, surface) < CONTRAST_MIN);
  report.push(['Contrast vs surface', low.length ? 'relief' : 'pass',
    low.length ? `below ${CONTRAST_MIN}:1 — relief required (visible labels or table view): ${JSON.stringify(low.map((c) => [c, +contrast(c, surface).toFixed(2)]))}`
      : `all ${palette.length} >= ${CONTRAST_MIN}:1`]);

  const metrics = {
    cvdWorst: +wd.toFixed(1), cvdPair: worst ? [worst[2], worst[3]] : null, cvdKind: worst ? worst[1] : null, tritanWorst: +tri.toFixed(1),
    normalWorst: +nd.toFixed(1), normalPair: nworst ? [nworst[1], nworst[2]] : null,
    offBand: offband, lowChroma: lowc, lowContrast: low, surface,
  };
  return { report, ok, metrics };
}

/**
 * Stepped-ramp checks: monotone L, adjacent ΔL, light-end contrast, one hue.
 * `multiHue: true` skips the hue-spread check (viridis-class ramps).
 */
export function validateOrdinal(palette, { mode = 'light', surface, multiHue = false } = {}) {
  surface ??= DEFAULT_SURFACE[mode];
  const report = [];
  let ok = true;
  const Ls = palette.map((c) => oklch(c)[0]);

  const order = [...Ls.keys()].sort((a, b) => Ls[a] - Ls[b]);
  const fwd = order.every((v, i) => v === i);
  const rev = order.every((v, i) => v === Ls.length - 1 - i);
  const mono = fwd || rev;
  if (!mono) ok = false;
  report.push(['Lightness monotone', mono, mono ? 'steps read light→dark' : `out of order — L values ${JSON.stringify(Ls.map((l) => +l.toFixed(3)))}`]);

  const gaps = Ls.slice(1).map((l, i) => Math.abs(l - Ls[i]));
  const thin = gaps.map((g, i) => [palette[i], palette[i + 1], g]).filter(([, , g]) => g < ORDINAL_MIN_DL).map(([a, b, g]) => [a, b, +g.toFixed(3)]);
  if (thin.length) ok = false;
  report.push(['Adjacent ΔL', !thin.length, thin.length ? `steps too close: ${JSON.stringify(thin)}` : `all gaps >= ${ORDINAL_MIN_DL}`]);

  const byL = [...palette].sort((a, b) => oklch(a)[0] - oklch(b)[0]);
  const lightest = mode === 'light' ? byL[byL.length - 1] : byL[0];
  const cr = lightest ? contrast(lightest, surface) : 99;
  if (cr < ORDINAL_LIGHT_FLOOR) ok = false;
  report.push(['Light-end contrast', cr >= ORDINAL_LIGHT_FLOOR, `${lightest} at ${cr.toFixed(2)}:1 vs surface` + (cr >= ORDINAL_LIGHT_FLOOR ? '' : ` — below ${ORDINAL_LIGHT_FLOOR}:1 floor`)]);

  // Hue spread over chromatic steps only (a neutral gray has no hue).
  const hues = palette.filter((c) => oklch(c)[1] >= 0.02).map((c) => oklch(c)[2]);
  let spread = hues.length ? Math.max(...hues) - Math.min(...hues) : 0;
  if (spread > 180) spread = 360 - spread;
  const oneHue = multiHue || spread <= ORDINAL_HUE_SPREAD;
  if (!oneHue) ok = false;
  report.push(['Single hue', oneHue, `hue spread ${spread.toFixed(0)}°` + (oneHue ? (multiHue ? ' (multi-hue ramp, check skipped)' : '') : ` — >${ORDINAL_HUE_SPREAD}°, not a one-hue ramp`)]);

  const metrics = { monotone: mono, minDeltaL: gaps.length ? +Math.min(...gaps).toFixed(3) : 1, lightEndContrast: +cr.toFixed(2), hueSpread: +spread.toFixed(0), surface };
  return { report, ok, metrics };
}

// -- CLI --------------------------------------------------------------------------------
const GLYPH = { true: 'PASS', false: 'FAIL', pass: 'PASS', floor: 'WARN', fail: 'FAIL', relief: 'WARN' };

function printReport({ report, ok }, { mode, surface, ordinal, n }) {
  console.log(`\nPalette (${mode}, surface ${surface}, ${ordinal ? 'ordinal ramp' : 'categorical'}): ${n} slots`);
  for (const [name, state, detail] of report) console.log(`  [${(GLYPH[state] ?? state).padEnd(4)}] ${name.padEnd(22)} ${detail}`);
  console.log(`\n  → ${ok ? 'ALL CHECKS PASS' : 'FAILED — fix the marked checks'}`
    + (ordinal ? '  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)\n'
      : '  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)\n'));
}

if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('validate_palette.js')) {
  const args = process.argv.slice(2);
  const VALUE_FLAGS = new Set(['--mode', '--surface', '--pairs']);
  const CHOICES = { mode: ['light', 'dark'], pairs: ['adjacent', 'all'] };
  const opts = {}; let positional = null;
  for (let i = 0; i < args.length; i++) {
    let a = args[i]; let val;
    const eq = a.indexOf('='); if (eq > 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
    if (VALUE_FLAGS.has(a)) opts[a.slice(2)] = val ?? args[++i];
    else if (a === '--ordinal') opts.ordinal = true;
    else if (a === '--multi-hue') opts.multiHue = true;
    else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2); }
    else if (positional === null) positional = a;
    else { console.error(`unexpected extra positional: ${a}`); process.exit(2); }
  }
  for (const [k, allowed] of Object.entries(CHOICES)) {
    if (opts[k] != null && !allowed.includes(opts[k])) { console.error(`--${k} must be one of: ${allowed.join(', ')} (got ${JSON.stringify(opts[k])})`); process.exit(2); }
  }
  const palette = splitColors(positional);
  if (!palette.length) { console.error('usage: node scripts/validate_palette.js "#hex,#hex,..." [--mode light|dark] [--surface #hex] [--pairs adjacent|all] [--ordinal] [--multi-hue]'); process.exit(2); }
  const mode = opts.mode || 'light';
  const rawSurface = opts.surface != null ? stripWs(opts.surface) : '';
  const surface = rawSurface || DEFAULT_SURFACE[mode];
  const badHex = [...palette, surface].filter((c) => !isHexColor(c));
  if (badHex.length) { console.error(`invalid hex value(s): ${badHex.join(', ')} — expected #rrggbb`); process.exit(2); }
  const pairs = opts.pairs || 'adjacent';
  const result = opts.ordinal ? validateOrdinal(palette, { mode, surface, multiHue: !!opts.multiHue }) : validate(palette, { mode, surface, pairs });
  printReport(result, { mode, surface, ordinal: !!opts.ordinal, n: palette.length });
  process.exit(result.ok ? 0 : 1);
}
