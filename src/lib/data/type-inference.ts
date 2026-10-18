/**
 * Tableau-style type inference over a sample of raw CSV cells (shard S1).
 *
 * Owns `isNullToken`, `inferType` (one column), `inferGeoRole` (v2, D-13) and
 * `inferAll` (a header plus sample rows → `FieldMeta[]` skeletons). Rules are
 * docs/TABLEAU-SPEC.md §1.2: null tokens are stripped first; a type wins only
 * when every sampled non-null value parses; order boolean → integer → number →
 * date/datetime → string. Counts in the returned `FieldMeta` describe the
 * sample only; the column store overwrites them with full-file numbers at
 * build time.
 *
 * Geographic roles come from the header name and the sampled values together
 * (`inferGeoRole`): a string column takes the area role (`us-state`,
 * `country`, `us-county`, `ercot-zone`) that at least `GEO_MATCH_SHARE` of its
 * sampled non-null values match in `geo-names.ts`, the header deciding ties;
 * a numeric column is `latitude` / `longitude` only when its header says so
 * and the values sit in range. `typeOverrides[field].geoRole` is applied by
 * the loader afterwards (null clears).
 *
 * Must not import svelte or DOM (R-PURE); may import `lib/core` and siblings.
 */
import type { Aggregation, Continuity, DataType, FieldMeta, GeoRole, Role, Storage } from '../core/types';
import { detectDateFormat } from './date-parse';
import {
  COMPASS_WORDS, isLatitude, isLongitude, matchCountry, matchErcotZone, matchUsCounty, matchUsState, normalizeGeoKey,
} from './geo-names';

/** Null tokens, lower-cased (§1.2): the empty cell plus common export sentinels. */
const NULL_TOKENS: ReadonlySet<string> = new Set(['', 'null', 'na', 'n/a', 'nan', '#n/a']);

/** Boolean tokens, lower-cased (§1.2). `0`/`1` stay numeric. */
const BOOL_TOKENS: ReadonlySet<string> = new Set(['true', 'false', 't', 'f', 'yes', 'no', 'y', 'n']);

/** Lower-cased tokens that mean `true`. */
export const TRUE_TOKENS: ReadonlySet<string> = new Set(['true', 't', 'yes', 'y']);

/** `|v| < 2^31` fits an `Int32Array` (−2^31 itself is the store's null sentinel). */
export const INT32_LIMIT = 2_147_483_648;

/**
 * True when the raw cell is one of the null tokens after trimming. The first
 * character gates the slow path: every null token starts with whitespace, `#`,
 * `N` or `n`, so digits, signs and ordinary words return without allocating.
 */
export function isNullToken(raw: string): boolean {
  const n = raw.length;
  if (n === 0) return true;
  const c = raw.charCodeAt(0);
  if (c > 32 && c !== 35 && c !== 78 && c !== 110) return false;
  return NULL_TOKENS.has(raw.trim().toLowerCase());
}

const INT_RE = /^[+-]?\d+$/;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Result of `inferType`. */
export interface InferredType {
  type: DataType;
  storage: Storage;
  dateFormat: string | null;
  dateAmbiguous: boolean;
  /** Share of sampled non-null values the winning type parsed (1.0 for rule-based wins). */
  confidence: number;
  /** Non-null sampled values. */
  sampled: number;
  /** Null-token sampled values. */
  nulls: number;
}

/** Parse an integer-looking string already matched by `INT_RE`. */
function toInt(s: string): number {
  return Number(s);
}

/**
 * Infer the type of one column from raw sampled cells (§1.2 order). Values are
 * trimmed and null tokens removed before any rule runs. An all-null sample is `string`.
 */
export function inferType(samples: readonly string[]): InferredType {
  const vals: string[] = [];
  let nulls = 0;
  for (const raw of samples) {
    if (isNullToken(raw)) { nulls++; continue; }
    vals.push(raw.trim());
  }
  const base = { dateFormat: null, dateAmbiguous: false, confidence: 1, sampled: vals.length, nulls };
  if (vals.length === 0) return { type: 'string', storage: 'dict', ...base, confidence: 0 };

  let allBool = true, allInt = true, allNum = true;
  for (const v of vals) {
    if (allBool && !BOOL_TOKENS.has(v.toLowerCase())) allBool = false;
    if (allInt && !(INT_RE.test(v) && Math.abs(toInt(v)) < INT32_LIMIT)) allInt = false;
    if (allNum && !NUM_RE.test(v)) allNum = false;
    if (!allBool && !allInt && !allNum) break;
  }
  if (allBool) return { type: 'boolean', storage: 'bool', ...base };
  if (allInt) return { type: 'integer', storage: 'i32', ...base };
  if (allNum) return { type: 'number', storage: 'f64', ...base };

  const det = detectDateFormat(vals);
  if (det) {
    return { type: det.hasTime ? 'datetime' : 'date', storage: 'date', ...base, dateFormat: det.pattern, dateAmbiguous: det.ambiguous };
  }
  return { type: 'string', storage: 'dict', ...base };
}

// ---------------------------------------------------------------------------
// Geographic roles (v2, D-13)
// ---------------------------------------------------------------------------

/** Share of sampled non-null values that must match a geo table for the role to be assigned. */
export const GEO_MATCH_SHARE = 0.8;

/** Header tokens (lower-cased, split on non-alphanumerics and camelCase) that hint a role. */
const HEADER_HINTS: ReadonlyArray<[tokens: readonly string[], role: GeoRole]> = [
  [['state', 'st', 'states', 'statecode'], 'us-state'],
  [['country', 'countries', 'iso', 'iso2', 'iso3', 'alpha2', 'alpha3', 'nation', 'cntry', 'countrycode'], 'country'],
  [['county', 'counties', 'fips', 'countyfips'], 'us-county'],
  [['zone', 'zones', 'weatherzone', 'loadzone', 'ercotzone'], 'ercot-zone'],
  [['lat', 'lats', 'latitude'], 'latitude'],
  [['lon', 'lng', 'long', 'longitude'], 'longitude'],
];

/** Roles in tie-break order when several tables match equally and the header is silent. */
const ROLE_PRIORITY: readonly GeoRole[] = ['us-state', 'ercot-zone', 'country', 'us-county'];

/** Numeric types whose columns can carry a coordinate role. */
const NUMERIC_TYPES: ReadonlySet<DataType> = new Set<DataType>(['integer', 'number']);

/** Role hinted by a column header, or null. `State`, `state_code`, `weather_zone`, `Lat`, `lonDeg` all hint. */
export function headerGeoHint(name: string): GeoRole | null {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const tokens = spaced.split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  const joined = tokens.join('');
  for (const [hints, role] of HEADER_HINTS) {
    for (const t of tokens) if (hints.includes(t)) return role;
    if (hints.includes(joined)) return role;
  }
  return null;
}

/**
 * Infer the geographic role of one column from its header and sampled non-null
 * values (already trimmed). `type` is the column's data type: numeric columns
 * can only be `latitude` / `longitude` (header hint + ≥ `GEO_MATCH_SHARE` of
 * values in range, or FIPS integers under a county header); every other type
 * is matched against the state / country / county / zone tables. An ERCOT zone
 * column whose header does not say so must contain a non-compass spelling
 * (`Houston`, `Panhandle`, `South Central`, `COAST`, …), and bare 5-digit FIPS
 * strings count as counties only under a county / FIPS header. Returns null
 * when nothing reaches the share.
 */
export function inferGeoRole(name: string, values: readonly string[], type: DataType): GeoRole | null {
  const n = values.length;
  if (n === 0) return null;
  const hint = headerGeoHint(name);
  const need = Math.ceil(n * GEO_MATCH_SHARE);

  if (NUMERIC_TYPES.has(type)) {
    if (hint === 'latitude' || hint === 'longitude') {
      const inRange = hint === 'latitude' ? isLatitude : isLongitude;
      let ok = 0;
      for (const v of values) if (inRange(Number(v))) ok++;
      return ok >= need ? hint : null;
    }
    if (hint === 'us-county') {
      let ok = 0;
      for (const v of values) { const x = Number(v); if (Number.isInteger(x) && matchUsCounty(String(x).padStart(5, '0'), true)) ok++; }
      return ok >= need ? 'us-county' : null;
    }
    return null;
  }
  if (type !== 'string') return null;

  const allowFips = hint === 'us-county';
  const cache = new Map<string, number>(); // bitmask: 1 state, 2 country, 4 zone, 8 county
  let state = 0, country = 0, zone = 0, county = 0, distinctiveZone = false;
  for (const v of values) {
    let bits = cache.get(v);
    if (bits === undefined) {
      bits = 0;
      if (matchUsState(v)) bits |= 1;
      if (matchCountry(v)) bits |= 2;
      if (matchErcotZone(v)) { bits |= 4; if (!COMPASS_WORDS.has(normalizeGeoKey(v))) distinctiveZone = true; }
      if (matchUsCounty(v, allowFips)) bits |= 8;
      cache.set(v, bits);
    }
    if (bits & 1) state++;
    if (bits & 2) country++;
    if (bits & 4) zone++;
    if (bits & 8) county++;
  }
  const scores: Partial<Record<GeoRole, number>> = { 'us-state': state, country, 'ercot-zone': zone, 'us-county': county };
  if (!(hint === 'ercot-zone' || distinctiveZone)) scores['ercot-zone'] = 0;
  const candidates = ROLE_PRIORITY.filter((r) => (scores[r] ?? 0) >= need);
  if (candidates.length === 0) return null;
  if (hint && candidates.includes(hint)) return hint;
  let best = candidates[0]!;
  for (const r of candidates) if ((scores[r] ?? 0) > (scores[best] ?? 0)) best = r;
  return best;
}

/** Default role / continuity / aggregation per type (§2). */
export function defaultsFor(type: DataType): { role: Role; defaultContinuity: Continuity; defaultAggregation: Aggregation } {
  if (type === 'integer' || type === 'number') return { role: 'measure', defaultContinuity: 'continuous', defaultAggregation: 'sum' };
  return { role: 'dimension', defaultContinuity: 'discrete', defaultAggregation: 'count' };
}

/** Storage used for a (possibly overridden) type (§1.1). */
export function storageFor(type: DataType): Storage {
  switch (type) {
    case 'string': return 'dict';
    case 'integer': return 'i32';
    case 'number': return 'f64';
    case 'boolean': return 'bool';
    default: return 'date';
  }
}

/** Make header names unique: duplicates become `name (2)`, `name (3)`…; blanks become `Column N`. */
export function uniqueHeader(header: readonly string[]): string[] {
  const used = new Set<string>();
  return header.map((raw, i) => {
    const base = raw.trim() === '' ? `Column ${i + 1}` : raw.trim();
    let name = base;
    for (let k = 2; used.has(name); k++) name = `${base} (${k})`;
    used.add(name);
    return name;
  });
}

/** Trimmed non-null cells of a sample column. */
export function nonNullValues(samples: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of samples) if (!isNullToken(raw)) out.push(raw.trim());
  return out;
}

/**
 * Infer every column of a sample. `sampleRows[r][c]` is the raw cell (missing cells
 * are nulls). Returns `FieldMeta` skeletons with sample-based counts; `rowCount`,
 * `nullCount`, `cardinality`, `min`, `max`, `topValues`, `parseErrors` are finalised
 * by the column store once the whole file is built. `geoRole` is inferred here
 * (`inferGeoRole`) and may be overridden by the loader.
 */
export function inferAll(header: readonly string[], sampleRows: readonly (readonly string[])[]): FieldMeta[] {
  const names = uniqueHeader(header);
  const column: string[] = [];
  return names.map((name, index) => {
    column.length = 0;
    for (const row of sampleRows) column.push(row[index] ?? '');
    const inf = inferType(column);
    const d = defaultsFor(inf.type);
    return {
      name, index, type: inf.type, role: d.role,
      defaultContinuity: d.defaultContinuity, defaultAggregation: d.defaultAggregation,
      storage: inf.storage,
      rowCount: sampleRows.length, nullCount: inf.nulls, cardinality: 0, highCardinality: false,
      min: null, max: null, topValues: [],
      dateFormat: inf.dateFormat, dateAmbiguous: inf.dateAmbiguous,
      parseErrors: 0, confidence: inf.confidence,
      geoRole: inferGeoRole(name, nonNullValues(column), inf.type),
    };
  });
}
