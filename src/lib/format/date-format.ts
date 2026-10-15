/**
 * Date formatting per docs/TABLEAU-SPEC.md §4.2 (part / trunc labels) and §8
 * (pattern tokens, standard list). Every value is an epoch-ms number and
 * every part is computed in **UTC** (§1.2 Time zone), so a file renders the
 * same on every device. Month and weekday names are English (§10).
 * Framework-free [R-PURE]: imports only `../core/types`.
 */
import type { DateLevel } from '../core/types';

/** English month names, January first. */
export const MONTH_NAMES: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** English weekday names, Monday first (ISO order). */
export const WEEKDAY_NAMES: readonly string[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Tableau's standard date format presets (§8.1), in dialog order. */
export const STANDARD_DATE_FORMATS: readonly string[] = [
  'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'MMM d, yyyy', 'MMMM d, yyyy',
  'ddd, MMM d, yyyy', 'MMM yyyy', 'yyyy', 'Q yyyy', 'HH:mm', 'h:mm a',
  'yyyy-MM-dd HH:mm', 'MMM d, yyyy h:mm a',
];

/** Automatic pattern for a raw `date` value (§8.1). */
export const AUTO_DATE_PATTERN = 'yyyy-MM-dd';

/** Automatic pattern for a raw `datetime` value (§8.1). */
export const AUTO_DATETIME_PATTERN = 'yyyy-MM-dd HH:mm:ss';

/** Pattern of a continuous (`trunc`) date pill label per level (§4.2: start of period). */
export const TRUNC_PATTERNS: Readonly<Record<DateLevel, string>> = {
  year: 'yyyy',
  quarter: 'Q yyyy',
  month: 'MMM yyyy',
  week: 'yyyy-MM-dd',
  day: 'yyyy-MM-dd',
  hour: 'yyyy-MM-dd HH:00',
  minute: 'yyyy-MM-dd HH:mm',
};

/** A date level or the extra `weekday` part reachable from the pill menu (§4.2). */
export type DatePart = DateLevel | 'weekday';

const MS_PER_DAY = 86_400_000;

/** ISO 8601 week number (1–53) of a UTC instant; week 1 holds the first Thursday. */
export function isoWeek(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3);
  const t = new Date(thursday);
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday - jan1) / MS_PER_DAY / 7);
}

/** Day of year (1–366) of a UTC instant. */
export function dayOfYear(ms: number): number {
  const d = new Date(ms);
  return 1 + Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / MS_PER_DAY);
}

/** ISO weekday 1 (Monday) … 7 (Sunday) of a UTC instant. */
export function isoWeekday(ms: number): number {
  return ((new Date(ms).getUTCDay() + 6) % 7) + 1;
}

// ---------------------------------------------------------------------------
// Pattern compiler (§8.2)
// ---------------------------------------------------------------------------

/** Pattern tokens, longest first so the scanner is greedy. */
const TOKENS = [
  'yyyy', 'yy', 'MMMM', 'MMM', 'MM', 'M', 'dddd', 'ddd', 'dd', 'd',
  'HH', 'H', 'hh', 'h', 'mm', 'ss', 'SSS', 'ww', 'w', 'Q', 'a', 'D',
] as const;

type Token = (typeof TOKENS)[number];
type Piece = { token: Token } | { literal: string };

const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n));
const pad3 = (n: number): string => n.toString().padStart(3, '0');

function renderToken(t: Token, d: Date, ms: number): string {
  switch (t) {
    case 'yyyy': return String(d.getUTCFullYear());
    case 'yy': return pad2(d.getUTCFullYear() % 100);
    case 'Q': return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
    case 'MM': return pad2(d.getUTCMonth() + 1);
    case 'M': return String(d.getUTCMonth() + 1);
    case 'MMM': return MONTH_NAMES[d.getUTCMonth()]!.slice(0, 3);
    case 'MMMM': return MONTH_NAMES[d.getUTCMonth()]!;
    case 'ww': return pad2(isoWeek(ms));
    case 'w': return String(isoWeek(ms));
    case 'dd': return pad2(d.getUTCDate());
    case 'd': return String(d.getUTCDate());
    case 'ddd': return WEEKDAY_NAMES[isoWeekday(ms) - 1]!.slice(0, 3);
    case 'dddd': return WEEKDAY_NAMES[isoWeekday(ms) - 1]!;
    case 'HH': return pad2(d.getUTCHours());
    case 'H': return String(d.getUTCHours());
    case 'hh': return pad2(d.getUTCHours() % 12 || 12);
    case 'h': return String(d.getUTCHours() % 12 || 12);
    case 'mm': return pad2(d.getUTCMinutes());
    case 'ss': return pad2(d.getUTCSeconds());
    case 'SSS': return pad3(d.getUTCMilliseconds());
    case 'a': return d.getUTCHours() < 12 ? 'AM' : 'PM';
    case 'D': return String(dayOfYear(ms));
  }
}

function tokenize(pattern: string): Piece[] {
  const out: Piece[] = [];
  let i = 0;
  let lit = '';
  const flush = (): void => { if (lit) { out.push({ literal: lit }); lit = ''; } };
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === "'") {
      if (pattern[i + 1] === "'") { lit += "'"; i += 2; continue; } // '' → '
      i++;
      while (i < pattern.length) { // quoted run; '' inside it is an apostrophe
        if (pattern[i] === "'") {
          if (pattern[i + 1] === "'") { lit += "'"; i += 2; continue; }
          i++;
          break;
        }
        lit += pattern[i]!;
        i++;
      }
      continue;
    }
    const tok = TOKENS.find((t) => pattern.startsWith(t, i));
    if (tok) { flush(); out.push({ token: tok }); i += tok.length; }
    else { lit += c; i++; }
  }
  flush();
  return out;
}

const patternCache = new Map<string, (ms: number) => string>();

/**
 * Compiles a pattern once and returns a renderer for epoch-ms values.
 * Tokens: `yyyy yy Q MM M MMM MMMM ww w dd d ddd dddd HH H hh h mm ss SSS a D`;
 * `'text'` is a literal (`''` an apostrophe); any other character is literal.
 */
export function compileDatePattern(pattern: string): (ms: number) => string {
  let f = patternCache.get(pattern);
  if (f) return f;
  const pieces = tokenize(pattern);
  f = (ms: number): string => {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    let s = '';
    for (const p of pieces) s += 'token' in p ? renderToken(p.token, d, ms) : p.literal;
    return s;
  };
  patternCache.set(pattern, f);
  return f;
}

/** Renders an epoch-ms value with a pattern (compiled and cached). */
export function formatDate(ms: number, pattern: string): string {
  return compileDatePattern(pattern)(ms);
}

// ---------------------------------------------------------------------------
// Part and trunc labels (§4.2)
// ---------------------------------------------------------------------------

/**
 * Label of a discrete date part value: `year 2024 → "2024"`, `quarter 3 → "Q3"`,
 * `month 3 → "Mar"`, `week 12 → "Wk 12"` (ISO week), `day 5 → "5"`,
 * `weekday 1 → "Mon"` (Monday first), `hour 14 → "14"`, `minute 7 → "7"`.
 * Out-of-domain numbers fall back to the bare number.
 */
export function datePartLabel(part: DatePart, value: number): string {
  if (!Number.isFinite(value)) return '';
  const n = Math.trunc(value);
  switch (part) {
    case 'quarter': return `Q${n}`;
    case 'month': return MONTH_NAMES[n - 1]?.slice(0, 3) ?? String(n);
    case 'week': return `Wk ${n}`;
    case 'weekday': return WEEKDAY_NAMES[n - 1]?.slice(0, 3) ?? String(n);
    default: return String(n);
  }
}

/** The part value of an instant, as the worker would group it (UTC, §4.2 domains). */
export function datePartOf(part: DatePart, ms: number): number {
  const d = new Date(ms);
  switch (part) {
    case 'year': return d.getUTCFullYear();
    case 'quarter': return Math.floor(d.getUTCMonth() / 3) + 1;
    case 'month': return d.getUTCMonth() + 1;
    case 'week': return isoWeek(ms);
    case 'day': return d.getUTCDate();
    case 'weekday': return isoWeekday(ms);
    case 'hour': return d.getUTCHours();
    case 'minute': return d.getUTCMinutes();
  }
}

/** Label of a continuous (`trunc`) date value at a level: `Q1 2024`, `Jan 2024`, `2024-02-05 14:00` …. */
export function dateTruncLabel(level: DateLevel, ms: number): string {
  return formatDate(ms, TRUNC_PATTERNS[level]);
}

/** Truncates an instant to the start of its period at `level` (ISO Monday for `week`), in UTC. */
export function truncDate(level: DateLevel, ms: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (level) {
    case 'year': return Date.UTC(y, 0, 1);
    case 'quarter': return Date.UTC(y, m - (m % 3), 1);
    case 'month': return Date.UTC(y, m, 1);
    case 'week': return Date.UTC(y, m, d.getUTCDate() - (isoWeekday(ms) - 1));
    case 'day': return Date.UTC(y, m, d.getUTCDate());
    case 'hour': return Date.UTC(y, m, d.getUTCDate(), d.getUTCHours());
    case 'minute': return Date.UTC(y, m, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  }
}
