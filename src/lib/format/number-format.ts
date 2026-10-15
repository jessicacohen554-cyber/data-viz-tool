/**
 * Number formatting per Tableau's Format dialog (docs/TABLEAU-SPEC.md §7).
 *
 * Owns: rounding (half away from zero on the decimal string), the
 * number / currency / percent / scientific kinds, the custom-format subset
 * (§7.3), units K/M/B/auto, prefix/suffix and the four negative styles.
 * Locale grouping, decimal characters and currency symbols come from
 * `Intl.NumberFormat`. Framework-free [R-PURE]: imports only `../core/types`.
 *
 * **Negative "red" styles.** A `ValueFormatter` returns a string, so the red
 * styles cannot carry a color. `formatNumberParts()` returns
 * `{ text, negative }` for callers that can style; `formatNumber()` prefixes
 * the text with `NEGATIVE_MARK` (a zero-width space, invisible if ignored)
 * when the style is `red` or `-red` and the value is negative. The UI tests
 * `isNegativeMarked()` and strips it with `stripNegativeMark()` before
 * applying `--negative`.
 */
import type { FormatSpec } from '../core/types';

/** Default BCP-47 locale when `FormatSpec.locale` is absent. */
export const DEFAULT_LOCALE = 'en-US';

/** Default ISO 4217 currency when `FormatSpec.currency` is absent. */
export const DEFAULT_CURRENCY = 'USD';

/** Hard cap on decimals (Tableau's dialog allows 0–15). */
export const MAX_DECIMALS = 15;

/**
 * Prefix marking a value rendered in a red negative style. A zero-width
 * space (U+200B): invisible when a consumer ignores it, detectable when it
 * does not.
 */
export const NEGATIVE_MARK = '​';

/** Unit divisors for `FormatSpec.units`. */
const UNIT_DIVISOR: Record<'K' | 'M' | 'B', number> = { K: 1e3, M: 1e6, B: 1e9 };

/** Context a caller supplies when the format runs on an axis. */
export interface NumberFormatContext {
  /**
   * The axis maximum (absolute) that `units: 'auto'` is resolved from so every
   * tick shares one unit. Absent (label / tooltip context): `auto` = `none`.
   */
  axisMax?: number;
  /**
   * True on axis ticks: `automatic` uses `units: 'auto'` and one decimal when
   * a unit divides (`1.2M`).
   */
  axis?: boolean;
  /** True when the field is integer-typed (`automatic` → 0 decimals). */
  integer?: boolean;
}

/** A formatted number plus the facts the UI may need to style it. */
export interface FormattedNumber {
  /** Display text without the `NEGATIVE_MARK`. */
  text: string;
  /** True when the value was negative *and* the style is `red` or `-red`. */
  negative: boolean;
}

/** True when `s` carries the red-negative marker. */
export function isNegativeMarked(s: string): boolean {
  return s.startsWith(NEGATIVE_MARK);
}

/** Removes the red-negative marker (no-op when absent). */
export function stripNegativeMark(s: string): string {
  return isNegativeMarked(s) ? s.slice(NEGATIVE_MARK.length) : s;
}

// ---------------------------------------------------------------------------
// Decimal-string rounding
// ---------------------------------------------------------------------------

/** Expands a non-negative finite number to a plain decimal string (no exponent). */
function plainDecimal(abs: number): string {
  const s = String(abs);
  const e = s.indexOf('e');
  if (e < 0) return s;
  const mant = s.slice(0, e).replace('.', '');
  const exp = Number(s.slice(e + 1));
  const dot = s.slice(0, e).indexOf('.');
  const intLen = (dot < 0 ? s.slice(0, e).length : dot) + exp;
  if (intLen <= 0) return '0.' + '0'.repeat(-intLen) + mant;
  if (intLen >= mant.length) return mant + '0'.repeat(intLen - mant.length);
  return mant.slice(0, intLen) + '.' + mant.slice(intLen);
}

/**
 * Rounds `|v|` half away from zero at `decimals` on its shortest decimal
 * representation, so `1.005 → "1.01"` and `2.5 → "3"` (§7.1 Rounding).
 * Returns the digits as a string with exactly `decimals` fraction digits
 * (no fraction part when `decimals` is 0).
 */
export function roundDecimalString(v: number, decimals: number): string {
  const d = Math.max(0, Math.min(MAX_DECIMALS, Math.trunc(decimals)));
  const s = plainDecimal(Math.abs(v));
  const dot = s.indexOf('.');
  let int = dot < 0 ? s : s.slice(0, dot);
  let frac = dot < 0 ? '' : s.slice(dot + 1);
  if (frac.length > d) {
    const up = frac.charCodeAt(d) >= 53; // '5'
    frac = frac.slice(0, d);
    if (up) {
      const digits = (int + frac).split('');
      let i = digits.length - 1;
      while (i >= 0) {
        if (digits[i] === '9') { digits[i] = '0'; i--; }
        else { digits[i] = String.fromCharCode(digits[i]!.charCodeAt(0) + 1); break; }
      }
      if (i < 0) digits.unshift('1');
      const all = digits.join('');
      int = all.slice(0, all.length - d);
      frac = all.slice(all.length - d);
    }
  } else {
    frac = frac.padEnd(d, '0');
  }
  int = int.replace(/^0+(?=\d)/, '');
  return d === 0 ? int : `${int}.${frac}`;
}

/** Half-away-from-zero rounding as a number (sign restored). */
export function roundHalfAway(v: number, decimals: number): number {
  const r = Number(roundDecimalString(v, decimals));
  return v < 0 ? -r : r;
}

// ---------------------------------------------------------------------------
// Intl helpers
// ---------------------------------------------------------------------------

const intlCache = new Map<string, Intl.NumberFormat>();

/** Cached `Intl.NumberFormat`; one instance per (locale, options) pair. */
function intl(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = intlCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, opts);
    } catch {
      f = new Intl.NumberFormat(DEFAULT_LOCALE, opts);
    }
    intlCache.set(key, f);
  }
  return f;
}

/**
 * Formats a non-negative value already rounded to `decimals`, with locale
 * grouping; `trim` drops trailing fraction zeros (keeping ≥ `minDecimals`).
 */
function groupDigits(abs: number, decimals: number, thousands: boolean, locale: string, trim: boolean, minDecimals = 0): string {
  const f = intl(locale, {
    minimumFractionDigits: trim ? Math.min(minDecimals, decimals) : decimals,
    maximumFractionDigits: decimals,
    useGrouping: thousands,
  });
  return f.format(abs);
}

/** Resolves the unit letter and divisor for a spec in a context. */
function resolveUnit(units: FormatSpec['units'], ctx: NumberFormatContext, abs: number): { letter: string; div: number } {
  if (!units || units === 'none') return { letter: '', div: 1 };
  if (units === 'auto') {
    const ref = ctx.axisMax !== undefined ? Math.abs(ctx.axisMax) : (ctx.axis ? abs : 0);
    if (ref >= 1e9) return { letter: 'B', div: 1e9 };
    if (ref >= 1e6) return { letter: 'M', div: 1e6 };
    if (ref >= 1e3) return { letter: 'K', div: 1e3 };
    return { letter: '', div: 1 };
  }
  return { letter: units, div: UNIT_DIVISOR[units] };
}

/** Wraps a positive core string in the negative style. */
function applyNegative(core: string, negative: boolean, style: FormatSpec['negative']): FormattedNumber {
  if (!negative) return { text: core, negative: false };
  switch (style ?? '-') {
    case '()': return { text: `(${core})`, negative: false };
    case 'red': return { text: core, negative: true };
    case '-red': return { text: `-${core}`, negative: true };
    default: return { text: `-${core}`, negative: false };
  }
}

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

function formatScientific(abs: number, decimals: number, locale: string): string {
  if (abs === 0) return groupDigits(0, decimals, false, locale, false) + 'E+00';
  let exp = Math.floor(Math.log10(abs));
  let mant = abs / 10 ** exp;
  let m = roundDecimalString(mant, decimals);
  if (Number(m) >= 10) { exp += 1; mant /= 10; m = roundDecimalString(mant, decimals); }
  const sign = exp < 0 ? '-' : '+';
  const e = String(Math.abs(exp)).padStart(2, '0');
  return groupDigits(Number(m), decimals, false, locale, false) + `E${sign}${e}`;
}

/** Currency via Intl, unit letter inserted after the last digit (`$1M`, `1 M €`). */
function formatCurrency(abs: number, decimals: number, thousands: boolean, locale: string, currency: string, letter: string): string {
  const isIso = /^[A-Z]{3}$/.test(currency);
  if (!isIso) return currency + groupDigits(abs, decimals, thousands, locale, false) + letter;
  let parts: Intl.NumberFormatPart[];
  try {
    parts = intl(locale, {
      style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: thousands,
    }).formatToParts(abs);
  } catch {
    return currency + ' ' + groupDigits(abs, decimals, thousands, locale, false) + letter;
  }
  if (!letter) return parts.map((p) => p.value).join('');
  let last = -1;
  parts.forEach((p, i) => { if (p.type === 'integer' || p.type === 'fraction' || p.type === 'decimal') last = i; });
  return parts.map((p, i) => (i === last ? p.value + letter : p.value)).join('');
}

// ---------------------------------------------------------------------------
// Custom format strings (§7.3 subset)
// ---------------------------------------------------------------------------

/** One compiled `;` section of a custom format. */
interface CustomSection {
  prefix: string;
  suffix: string;
  minInt: number;
  minFrac: number;
  maxFrac: number;
  grouping: boolean;
  /** 10³ per trailing comma. */
  scale: number;
  percent: boolean;
  /** Exponent digit width when `E+00` / `E-00` present; 0 = none. `expPlus` keeps `+`. */
  expWidth: number;
  expPlus: boolean;
  /** False when the section has no digit placeholders (a literal-only section such as `"-"`). */
  hasDigits: boolean;
}

function compileSection(src: string): CustomSection {
  let prefix = '';
  let suffix = '';
  let mask = '';
  let percent = false;
  let expWidth = 0;
  let expPlus = false;
  let seenMask = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      const lit = end < 0 ? src.slice(i + 1) : src.slice(i + 1, end);
      if (seenMask) suffix += lit; else prefix += lit;
      i = end < 0 ? src.length : end + 1;
    } else if (c === '\\') {
      const lit = src[i + 1] ?? '';
      if (seenMask) suffix += lit; else prefix += lit;
      i += 2;
    } else if (c === '#' || c === '0' || ((c === ',' || c === '.') && (seenMask || /[#0]/.test(src[i + 1] ?? '')))) {
      if (seenMask && suffix) { suffix += c; i++; continue; } // digits after a suffix literal are literal
      mask += c; seenMask = true; i++;
    } else if (c === '%') {
      percent = true;
      if (seenMask) suffix += '%'; else prefix += '%';
      i++;
    } else if ((c === 'E' || c === 'e') && (src[i + 1] === '+' || src[i + 1] === '-') && src[i + 2] === '0' && seenMask) {
      expPlus = src[i + 1] === '+';
      let j = i + 2;
      while (src[j] === '0') j++;
      expWidth = j - (i + 2);
      i = j;
    } else {
      if (seenMask) suffix += c; else prefix += c;
      i++;
    }
  }
  const trailing = mask.match(/,+$/)?.[0].length ?? 0;
  const core = mask.replace(/,+$/, '');
  const dot = core.indexOf('.');
  const intMask = dot < 0 ? core : core.slice(0, dot);
  const fracMask = dot < 0 ? '' : core.slice(dot + 1);
  return {
    prefix, suffix,
    minInt: (intMask.match(/0/g) ?? []).length,
    minFrac: (fracMask.match(/0/g) ?? []).length,
    maxFrac: fracMask.replace(/[^#0]/g, '').length,
    grouping: /[#0],[#0]/.test(intMask),
    scale: 10 ** (3 * trailing),
    percent,
    expWidth, expPlus,
    hasDigits: /[#0]/.test(core),
  };
}

const customCache = new Map<string, CustomSection[]>();

/** Compiles `positive;negative;zero` sections once per format string. */
function compileCustom(fmt: string): CustomSection[] {
  let c = customCache.get(fmt);
  if (!c) { c = fmt.split(';').map(compileSection); customCache.set(fmt, c); }
  return c;
}

function renderSection(sec: CustomSection, abs: number, locale: string): string {
  if (!sec.hasDigits) return sec.prefix + sec.suffix;
  let v = abs / sec.scale;
  if (sec.percent) v *= 100;
  let expPart = '';
  if (sec.expWidth > 0 && v !== 0) {
    let exp = Math.floor(Math.log10(v));
    v = v / 10 ** exp;
    if (Number(roundDecimalString(v, sec.maxFrac)) >= 10) { exp += 1; v /= 10; }
    const sign = exp < 0 ? '-' : (sec.expPlus ? '+' : '');
    expPart = `E${sign}${String(Math.abs(exp)).padStart(sec.expWidth, '0')}`;
  } else if (sec.expWidth > 0) {
    expPart = `E${sec.expPlus ? '+' : ''}${'0'.repeat(sec.expWidth)}`;
  }
  const rounded = Number(roundDecimalString(v, sec.maxFrac));
  let digits = intl(locale, {
    minimumIntegerDigits: Math.max(1, sec.minInt),
    minimumFractionDigits: sec.minFrac,
    maximumFractionDigits: sec.maxFrac,
    useGrouping: sec.grouping,
  }).format(rounded);
  if (sec.minInt === 0 && rounded < 1 && digits.startsWith('0')) digits = digits.slice(1) || '0';
  return sec.prefix + digits + expPart + sec.suffix;
}

/**
 * Formats with a custom format string (`#,##0.00;(#,##0.00)` subset, §7.3).
 * One section applies to every value (negatives get `-`); two → the second
 * renders negatives (on the absolute value); three → the third renders zero.
 */
export function formatCustom(value: number, fmt: string, locale = DEFAULT_LOCALE): string {
  const secs = compileCustom(fmt);
  const abs = Math.abs(value);
  if (value === 0 && secs[2]) return renderSection(secs[2], 0, locale);
  if (value < 0 && secs[1]) return renderSection(secs[1], abs, locale);
  const out = renderSection(secs[0]!, abs, locale);
  return value < 0 ? `-${out}` : out;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Formats one number under a `FormatSpec`. Non-finite input renders as `''`
 * (null) or `'∞'`/`'NaN'` is never shown: NaN → `''`.
 */
export function formatNumberParts(value: number, spec: FormatSpec = { kind: 'automatic' }, ctx: NumberFormatContext = {}): FormattedNumber {
  if (!Number.isFinite(value)) return { text: '', negative: false };
  const locale = spec.locale ?? DEFAULT_LOCALE;
  const neg = value < 0;
  const abs = Math.abs(value);
  const thousands = spec.thousands ?? true;
  const decimals = Math.max(0, Math.min(MAX_DECIMALS, Math.trunc(spec.decimals ?? 2)));

  switch (spec.kind) {
    case 'custom': {
      if (!spec.custom) return formatNumberParts(value, { ...spec, kind: 'number' }, ctx);
      return { text: formatCustom(value, spec.custom, locale), negative: false };
    }
    case 'scientific': {
      const core = formatScientific(abs, decimals, locale);
      return applyNegative((spec.prefix ?? '') + core + (spec.suffix ?? ''), neg, spec.negative);
    }
    case 'percent': {
      const d = decimals;
      const core = groupDigits(Number(roundDecimalString(abs * 100, d)), d, thousands, locale, false) + '%';
      return applyNegative((spec.prefix ?? '') + core + (spec.suffix ?? ''), neg, spec.negative);
    }
    case 'currency': {
      const d = decimals;
      const { letter, div } = resolveUnit(spec.units, ctx, abs);
      const scaled = Number(roundDecimalString(abs / div, d));
      const core = formatCurrency(scaled, d, thousands, locale, spec.currency ?? DEFAULT_CURRENCY, letter);
      return applyNegative((spec.prefix ?? '') + core + (spec.suffix ?? ''), neg, spec.negative);
    }
    case 'automatic': {
      const { letter, div } = resolveUnit(ctx.axis ? 'auto' : (spec.units ?? 'none'), ctx, abs);
      const max = ctx.integer && letter === '' ? 0 : (letter ? 1 : (decimals));
      const scaled = Number(roundDecimalString(abs / div, max));
      const core = groupDigits(scaled, max, spec.thousands ?? true, locale, true) + letter;
      return applyNegative((spec.prefix ?? '') + core + (spec.suffix ?? ''), neg, spec.negative);
    }
    default: { // 'number', and date/boolean kinds applied to a number
      const d = decimals;
      const { letter, div } = resolveUnit(spec.units, ctx, abs);
      const scaled = Number(roundDecimalString(abs / div, d));
      const core = groupDigits(scaled, d, thousands, locale, false) + letter;
      return applyNegative((spec.prefix ?? '') + core + (spec.suffix ?? ''), neg, spec.negative);
    }
  }
}

/**
 * Formats one number to a display string. Red negative styles prefix
 * `NEGATIVE_MARK` (see the module JSDoc).
 */
export function formatNumber(value: number, spec?: FormatSpec, ctx?: NumberFormatContext): string {
  const r = formatNumberParts(value, spec, ctx);
  return r.negative ? NEGATIVE_MARK + r.text : r.text;
}
