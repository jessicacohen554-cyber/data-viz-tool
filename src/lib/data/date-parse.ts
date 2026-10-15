/**
 * Date parsing and calendar arithmetic for the data engine (shard S1).
 *
 * Owns: pattern detection over a sample (`detectDateFormat`), compiled pattern
 * parsers (`compileParser`), and UTC date-part / date-trunc arithmetic
 * (`datePart`, `dateTrunc`, `periodEnd`, `datePartLabel`). Everything is UTC and
 * week means ISO 8601 week (docs/TABLEAU-SPEC.md §1.2, §4.2, §10).
 *
 * Never calls `Date.parse` on free text (CLAUDE.md FORBIDDEN). Parsers are
 * hand-rolled scanners over char codes, not regular expressions, because the
 * loader runs them once per cell on ~500K-row files (plan §9).
 *
 * Must not import svelte, DOM or anything outside `lib/core` (R-PURE).
 */
import type { DateLevel } from '../core/types';

/** Milliseconds per day / hour / minute. */
const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;
const MS_MINUTE = 60_000;

/** Three-letter and full English month names, index 0 = January (§10: English only). */
export const MONTH_ABBR: readonly string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_FULL: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Civil calendar arithmetic (proleptic Gregorian, UTC) — Howard Hinnant's algorithms
// ---------------------------------------------------------------------------

/** Days since 1970-01-01 for a civil date (month 1–12). */
export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Civil date for a day count since 1970-01-01: `[year, month 1–12, day 1–31]`. */
export function civilFromDays(z: number): [number, number, number] {
  z += 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [m <= 2 ? y + 1 : y, m, d];
}

/** True for a Gregorian leap year. */
export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Days in a month (month 1–12). */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Epoch ms for a UTC civil date-time; no range quirks for years 0–99 (unlike `Date.UTC`). */
export function utcMs(y: number, m: number, d: number, H = 0, mi = 0, s = 0, ms = 0): number {
  return daysFromCivil(y, m, d) * MS_DAY + H * MS_HOUR + mi * MS_MINUTE + s * 1000 + ms;
}

/** ISO weekday, Monday = 1 … Sunday = 7, for a day count since the epoch (1970-01-01 was a Thursday). */
function isoWeekdayOfDays(days: number): number {
  const w = ((days + 3) % 7 + 7) % 7; // 0 = Monday
  return w + 1;
}

/** ISO 8601 week number and week-based year for an epoch-ms instant. */
export function isoWeek(ms: number): { week: number; weekYear: number } {
  const days = Math.floor(ms / MS_DAY);
  // Thursday of this ISO week decides the week-year.
  const thursday = days - isoWeekdayOfDays(days) + 4;
  const [y] = civilFromDays(thursday);
  const jan1 = daysFromCivil(y, 1, 1);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return { week, weekYear: y };
}

// ---------------------------------------------------------------------------
// Date parts and truncation
// ---------------------------------------------------------------------------

/**
 * Date part at `level`, in UTC: year (e.g. 2024), quarter 1–4, month 1–12,
 * ISO week 1–53, day of month 1–31, hour 0–23, minute 0–59. `NaN` in → `NaN` out.
 */
export function datePart(ms: number, level: DateLevel): number {
  if (ms !== ms) return NaN;
  switch (level) {
    case 'hour': return ((Math.floor(ms / MS_HOUR) % 24) + 24) % 24;
    case 'minute': return ((Math.floor(ms / MS_MINUTE) % 60) + 60) % 60;
    case 'week': return isoWeek(ms).week;
    default: {
      const [y, m, d] = civilFromDays(Math.floor(ms / MS_DAY));
      if (level === 'year') return y;
      if (level === 'quarter') return Math.floor((m - 1) / 3) + 1;
      if (level === 'month') return m;
      return d;
    }
  }
}

/** Start of the period containing `ms` at `level`, in UTC; week → the ISO week's Monday 00:00. */
export function dateTrunc(ms: number, level: DateLevel): number {
  if (ms !== ms) return NaN;
  switch (level) {
    case 'minute': return Math.floor(ms / MS_MINUTE) * MS_MINUTE;
    case 'hour': return Math.floor(ms / MS_HOUR) * MS_HOUR;
    case 'day': return Math.floor(ms / MS_DAY) * MS_DAY;
    case 'week': {
      const days = Math.floor(ms / MS_DAY);
      return (days - (isoWeekdayOfDays(days) - 1)) * MS_DAY;
    }
    default: {
      const [y, m] = civilFromDays(Math.floor(ms / MS_DAY));
      if (level === 'year') return utcMs(y, 1, 1);
      if (level === 'quarter') return utcMs(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
      return utcMs(y, m, 1);
    }
  }
}

/** Last millisecond of the period containing `ms` at `level` (for inclusive `dateRange.to`, §6.2). */
export function periodEnd(ms: number, level: DateLevel): number {
  const start = dateTrunc(ms, level);
  switch (level) {
    case 'minute': return start + MS_MINUTE - 1;
    case 'hour': return start + MS_HOUR - 1;
    case 'day': return start + MS_DAY - 1;
    case 'week': return start + 7 * MS_DAY - 1;
    default: {
      const [y, m] = civilFromDays(Math.floor(start / MS_DAY));
      const months = level === 'year' ? 12 : level === 'quarter' ? 3 : 1;
      let ny = y, nm = m + months;
      if (nm > 12) { ny += 1; nm -= 12; }
      return utcMs(ny, nm, 1) - 1;
    }
  }
}

/** Header label for a discrete date part (§4.2): `2024`, `Q1`, `Jan`, `Wk 6`, `5`, `14`, `7`. */
export function datePartLabel(level: DateLevel, part: number): string {
  if (part !== part) return 'Null';
  switch (level) {
    case 'quarter': return `Q${part}`;
    case 'month': return MONTH_ABBR[part - 1] ?? String(part);
    case 'week': return `Wk ${part}`;
    default: return String(part);
  }
}

/** `yyyy-MM-dd` or `yyyy-MM-dd HH:mm:ss` (when any time component is non-zero) for an epoch-ms value; `Null` for NaN. */
export function isoLabel(ms: number): string {
  if (ms !== ms) return 'Null';
  const days = Math.floor(ms / MS_DAY);
  const [y, m, d] = civilFromDays(days);
  const rem = ms - days * MS_DAY;
  const date = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
  if (rem === 0) return date;
  const H = Math.floor(rem / MS_HOUR), mi = Math.floor(rem / MS_MINUTE) % 60, s = Math.floor(rem / 1000) % 60;
  return `${date} ${pad(H, 2)}:${pad(mi, 2)}:${pad(s, 2)}`;
}

function pad(n: number, w: number): string {
  const s = String(n);
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

// ---------------------------------------------------------------------------
// Pattern compiler
// ---------------------------------------------------------------------------

/** A compiled date pattern: `parse` returns epoch ms (UTC) or `NaN` when the text does not match. */
export interface DateParser {
  /** The canonical pattern string (docs/TABLEAU-SPEC.md §8.2 tokens). */
  pattern: string;
  /** True when the pattern carries any time-of-day token (→ `datetime`). */
  hasTime: boolean;
  parse(text: string): number;
}

type NumField = 'y' | 'yy' | 'M' | 'd' | 'H' | 'h' | 'm' | 's';

type Segment =
  | { kind: 'num'; field: NumField; min: number; max: number }
  | { kind: 'lit'; text: string }
  | { kind: 'mon'; full: boolean }
  | { kind: 'ampm' }
  | { kind: 'zone' }
  | { kind: 'frac' };

/** Token → numeric field and natural digit width. */
const NUM_TOKENS: Record<string, { field: NumField; width: number }> = {
  yyyy: { field: 'y', width: 4 },
  yy: { field: 'yy', width: 2 },
  MM: { field: 'M', width: 2 }, M: { field: 'M', width: 1 },
  dd: { field: 'd', width: 2 }, d: { field: 'd', width: 1 },
  HH: { field: 'H', width: 2 }, H: { field: 'H', width: 1 },
  hh: { field: 'h', width: 2 }, h: { field: 'h', width: 1 },
  mm: { field: 'm', width: 2 },
  ss: { field: 's', width: 2 },
};

/** Split a pattern into segments. Letters that are not tokens, quoted text and punctuation are literals. */
function tokenize(pattern: string): Segment[] {
  const segs: Segment[] = [];
  const lit = (text: string) => {
    const last = segs[segs.length - 1];
    if (last && last.kind === 'lit') last.text += text; else segs.push({ kind: 'lit', text });
  };
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "'") {
      const close = pattern.indexOf("'", i + 1);
      const end = close < 0 ? pattern.length : close;
      lit(pattern.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < pattern.length && pattern[j] === ch) j++;
      const run = pattern.slice(i, j);
      if (ch === 'S') segs.push({ kind: 'frac' });
      else if (run === 'MMMM') segs.push({ kind: 'mon', full: true });
      else if (run === 'MMM') segs.push({ kind: 'mon', full: false });
      else if (run === 'a') segs.push({ kind: 'ampm' });
      else if (run === 'Z') segs.push({ kind: 'zone' });
      else if (NUM_TOKENS[run]) {
        const t = NUM_TOKENS[run]!;
        segs.push({ kind: 'num', field: t.field, min: t.width, max: t.width });
      } else lit(run);
      i = j;
      continue;
    }
    lit(ch);
    i++;
  }
  // Width rules: a numeric token touching another numeric token keeps its fixed width
  // (`yyyyMMdd`); otherwise 1- and 2-letter tokens accept 1–2 digits (`2/5/2024`), `yyyy` 4.
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]!;
    if (s.kind !== 'num') continue;
    const prev = segs[k - 1], next = segs[k + 1];
    const touching = (prev && prev.kind === 'num') || (next && next.kind === 'num');
    if (touching) continue;
    if (s.field === 'y') { s.min = 4; s.max = 4; }
    else if (s.field === 'yy') { s.min = 2; s.max = 2; }
    else { s.min = 1; s.max = 2; }
  }
  // A fraction directly after a literal `.` makes the `.` part of the optional fraction.
  for (let k = 1; k < segs.length; k++) {
    const s = segs[k]!, prev = segs[k - 1]!;
    if (s.kind === 'frac' && prev.kind === 'lit' && prev.text.endsWith('.')) {
      prev.text = prev.text.slice(0, -1);
      if (prev.text === '') { segs.splice(k - 1, 1); k--; }
    }
  }
  return segs;
}

const CC_0 = 48, CC_9 = 57, CC_SPACE = 32;

/**
 * Compile a pattern (§8.2 tokens: yyyy yy MMMM MMM MM M dd d HH H hh h mm ss SSS a Z,
 * `'text'` literals) into a fast scanner. Fractions are optional where the pattern has
 * `.SSS`; a `Z` segment accepts `Z`, `±HH:mm` or `±HHMM` and shifts to UTC. Two-digit years
 * map 00–68 → 2000–2068, 69–99 → 1969–1999 (§1.2). Invalid calendar values parse as `NaN`.
 */
export function compileParser(pattern: string): DateParser {
  const segs = tokenize(pattern);
  const hasTime = segs.some((s) => (s.kind === 'num' && (s.field === 'H' || s.field === 'h' || s.field === 'm' || s.field === 's')) || s.kind === 'frac');
  const n = segs.length;

  const parse = (text: string): number => {
    const len = text.length;
    let pos = 0;
    while (pos < len && text.charCodeAt(pos) === CC_SPACE) pos++;
    let end = len;
    while (end > pos && text.charCodeAt(end - 1) === CC_SPACE) end--;

    let y = 1970, M = 1, d = 1, H = 0, mi = 0, s = 0, ms = 0, offsetMin = 0;
    let pm = -1; // -1 none, 0 AM, 1 PM
    let has12h = false;

    for (let k = 0; k < n; k++) {
      const seg = segs[k]!;
      switch (seg.kind) {
        case 'num': {
          let v = 0, w = 0;
          while (w < seg.max && pos < end) {
            const c = text.charCodeAt(pos);
            if (c < CC_0 || c > CC_9) break;
            v = v * 10 + (c - CC_0);
            pos++; w++;
          }
          if (w < seg.min) return NaN;
          switch (seg.field) {
            case 'y': y = v; break;
            case 'yy': y = v <= 68 ? 2000 + v : 1900 + v; break;
            case 'M': M = v; break;
            case 'd': d = v; break;
            case 'H': H = v; break;
            case 'h': H = v; has12h = true; break;
            case 'm': mi = v; break;
            case 's': s = v; break;
          }
          break;
        }
        case 'lit': {
          const t = seg.text;
          for (let q = 0; q < t.length; q++) {
            if (pos >= end || text.charCodeAt(pos) !== t.charCodeAt(q)) return NaN;
            pos++;
          }
          break;
        }
        case 'mon': {
          let j = pos;
          while (j < end) {
            const c = text.charCodeAt(j);
            if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) break;
            j++;
          }
          const word = text.slice(pos, j);
          if (word.length < 3) return NaN;
          const idx = monthIndex(word, seg.full);
          if (idx < 0) return NaN;
          M = idx + 1;
          pos = j;
          break;
        }
        case 'ampm': {
          const two = text.slice(pos, pos + 2).toUpperCase();
          if (two === 'AM') pm = 0; else if (two === 'PM') pm = 1; else return NaN;
          pos += 2;
          break;
        }
        case 'frac': {
          if (pos < end && text.charCodeAt(pos) === 46) {
            let j = pos + 1, v = 0, w = 0;
            while (j < end) {
              const c = text.charCodeAt(j);
              if (c < CC_0 || c > CC_9) break;
              if (w < 3) v = v * 10 + (c - CC_0);
              j++; w++;
            }
            if (w === 0) return NaN;
            while (w < 3) { v *= 10; w++; }
            ms = v;
            pos = j;
          }
          break;
        }
        case 'zone': {
          if (pos >= end) return NaN;
          const c = text.charCodeAt(pos);
          if (c === 90 || c === 122) { pos++; break; } // Z
          if (c !== 43 && c !== 45) return NaN; // + -
          const sign = c === 45 ? -1 : 1;
          pos++;
          const hh = read2(text, pos, end); if (hh < 0) return NaN; pos += 2;
          if (pos < end && text.charCodeAt(pos) === 58) pos++;
          const mm = read2(text, pos, end); if (mm < 0) return NaN; pos += 2;
          offsetMin = sign * (hh * 60 + mm);
          break;
        }
      }
    }
    if (pos !== end) return NaN;
    if (has12h) {
      if (H < 1 || H > 12) return NaN;
      if (pm === 1 && H !== 12) H += 12;
      else if (pm === 0 && H === 12) H = 0;
      else if (pm < 0 && H === 12) H = 0;
    }
    if (M < 1 || M > 12 || d < 1 || d > daysInMonth(y, M) || H > 23 || mi > 59 || s > 59) return NaN;
    return utcMs(y, M, d, H, mi, s, ms) - offsetMin * MS_MINUTE;
  };

  return { pattern, hasTime, parse };
}

function read2(text: string, pos: number, end: number): number {
  if (pos + 2 > end) return -1;
  const a = text.charCodeAt(pos) - CC_0, b = text.charCodeAt(pos + 1) - CC_0;
  if (a < 0 || a > 9 || b < 0 || b > 9) return -1;
  return a * 10 + b;
}

/** English month lookup: full name or 3-letter prefix, case-insensitive; -1 when unknown. */
function monthIndex(word: string, full: boolean): number {
  const w = word.toLowerCase();
  for (let i = 0; i < 12; i++) {
    const name = MONTH_FULL[i]!.toLowerCase();
    if (full ? name === w : w.length === 3 && name.startsWith(w)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Result of `detectDateFormat`. */
export interface DetectedDateFormat {
  pattern: string;
  /** `datetime` when true, else `date`. */
  hasTime: boolean;
  /** Day/month order could not be resolved from the sample (defaults to M/d). */
  ambiguous: boolean;
}

/** Candidate patterns in trial order (§1.2). `{s}` is replaced by each date separator. */
const CANDIDATES: readonly { pattern: string; seps: readonly string[]; dm?: boolean }[] = [
  { pattern: "yyyy{s}MM{s}dd'T'HH:mm:ss.SSSZ", seps: ['-'] },
  { pattern: "yyyy{s}MM{s}dd'T'HH:mm:ss.SSS", seps: ['-'] },
  { pattern: "yyyy{s}MM{s}dd'T'HH:mm", seps: ['-'] },
  { pattern: 'yyyy{s}MM{s}dd HH:mm:ss.SSS', seps: ['-', '/', '.'] },
  { pattern: 'yyyy{s}MM{s}dd HH:mm', seps: ['-', '/', '.'] },
  { pattern: 'yyyy{s}MM{s}dd', seps: ['-', '/', '.', ' '] },
  { pattern: 'yyyyMMdd', seps: [''] },
  { pattern: 'MM{s}dd{s}yyyy HH:mm:ss', seps: ['/', '-', '.'], dm: true },
  { pattern: 'MM{s}dd{s}yyyy HH:mm', seps: ['/', '-', '.'], dm: true },
  { pattern: 'MM{s}dd{s}yyyy', seps: ['/', '-', '.', ' '], dm: true },
  { pattern: 'dd{s}MMM{s}yyyy', seps: ['-', ' ', '/'] },
  { pattern: 'MMM d, yyyy', seps: [''] },
  { pattern: 'MMMM d, yyyy', seps: [''] },
  { pattern: 'yyyy{s}MM', seps: ['-', '/'] },
  { pattern: 'HH:mm:ss', seps: [''] },
];

const parserCache = new Map<string, DateParser>();

/** `compileParser` with a process-wide cache (patterns are few; the loader asks per cell). */
export function cachedParser(pattern: string): DateParser {
  let p = parserCache.get(pattern);
  if (!p) { p = compileParser(pattern); parserCache.set(pattern, p); }
  return p;
}

/**
 * Pick the first candidate pattern that parses every sample (non-null, trimmed strings;
 * the caller strips null tokens). Returns null when none does. For `M/d` patterns the
 * D/M rule applies: a first field > 12 anywhere → `d/M`; a second field > 12 → `M/d`;
 * both → the pattern fails; neither → `ambiguous: true` with `M/d`.
 *
 * With `lenient` (an explicit `date` type override), when no candidate parses every
 * sample the one parsing the most samples wins (earlier candidate on ties); the
 * misses become parse errors. Null when nothing parses at all.
 */
export function detectDateFormat(samples: readonly string[], lenient = false): DetectedDateFormat | null {
  if (samples.length === 0) return null;
  let best: DetectedDateFormat | null = null;
  let bestHits = 0;
  for (const cand of CANDIDATES) {
    for (const sep of cand.seps) {
      const md = cand.pattern.replaceAll('{s}', sep);
      const trials: Array<{ pattern: string; ambiguous: boolean }> = [];
      if (cand.dm) {
        const dm = dayMonthOrder(samples, sep);
        const swapped = md.replace(`MM${sep}dd`, `dd${sep}MM`);
        if (dm === 'conflict') {
          if (!lenient) continue;
          trials.push({ pattern: md, ambiguous: false }, { pattern: swapped, ambiguous: false }); // score both orders
        } else trials.push({ pattern: dm === 'dM' ? swapped : md, ambiguous: dm === 'ambiguous' });
      } else trials.push({ pattern: md, ambiguous: false });
      for (const { pattern, ambiguous } of trials) {
        const parser = cachedParser(pattern);
        const hits = countParsed(parser, samples, lenient);
        if (hits === samples.length) return { pattern, hasTime: parser.hasTime, ambiguous };
        if (lenient && hits > bestHits) { bestHits = hits; best = { pattern, hasTime: parser.hasTime, ambiguous }; }
      }
    }
  }
  return best;
}

/** Samples the parser accepts; stops at the first miss unless `all` (lenient scoring). */
function countParsed(p: DateParser, samples: readonly string[], all: boolean): number {
  let hits = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = p.parse(samples[i]!);
    if (v === v) hits++;
    else if (!all) return hits;
  }
  return hits;
}

/** Scan `a{sep}b{sep}yyyy…` values: which of the first two fields exceeds 12. Values of another shape are skipped. */
function dayMonthOrder(samples: readonly string[], sep: string): 'Md' | 'dM' | 'ambiguous' | 'conflict' {
  let firstOver = false, secondOver = false;
  const sc = sep.charCodeAt(0);
  for (const raw of samples) {
    const t = raw.trim();
    const a = readNum(t, 0, sc); if (a.v < 0) continue;
    const b = readNum(t, a.end + 1, sc); if (b.v < 0) continue;
    if (a.v > 12) firstOver = true;
    if (b.v > 12) secondOver = true;
  }
  if (firstOver && secondOver) return 'conflict';
  if (firstOver) return 'dM';
  if (secondOver) return 'Md';
  return 'ambiguous';
}

function readNum(t: string, pos: number, sepCode: number): { v: number; end: number } {
  let v = 0, w = 0;
  while (pos < t.length && w < 2) {
    const c = t.charCodeAt(pos);
    if (c < CC_0 || c > CC_9) break;
    v = v * 10 + (c - CC_0); pos++; w++;
  }
  if (w === 0 || pos >= t.length || t.charCodeAt(pos) !== sepCode) return { v: -1, end: pos };
  return { v, end: pos };
}
