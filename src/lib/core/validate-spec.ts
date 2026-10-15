/**
 * Structural validation of a VizSpec against the contract and (optionally)
 * the loaded dataset's fields. Returns human-readable problems; an empty array
 * means valid. Run on URL-hash restore, saved-view load and JSON import.
 */
import type { FieldMeta, FilterSpec, Pill, ShelfId, VizSpec } from './types';
import {
  AGGREGATIONS, ALL_SHELVES, CHART_TYPE_IDS, CONTINUITIES, DATE_LEVELS, ROLES,
  SINGLE_PILL_SHELVES, SPEC_VERSION,
} from './constants';

const FILTER_KINDS = new Set(['categorical', 'range', 'dateRange', 'topN', 'wildcard']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validatePill(pill: unknown, shelf: ShelfId, index: number, fields: Map<string, FieldMeta> | null, out: string[]): void {
  const where = `shelves.${shelf}[${index}]`;
  if (!isRecord(pill)) { out.push(`${where}: not an object`); return; }
  const p = pill as Partial<Pill>;
  if (typeof p.id !== 'string' || !p.id) out.push(`${where}: missing id`);
  if (typeof p.field !== 'string' || !p.field) out.push(`${where}: missing field`);
  if (!ROLES.includes(p.role as never)) out.push(`${where}: bad role "${String(p.role)}"`);
  if (!CONTINUITIES.includes(p.continuity as never)) out.push(`${where}: bad continuity "${String(p.continuity)}"`);
  if (!AGGREGATIONS.includes(p.aggregation as never)) out.push(`${where}: bad aggregation "${String(p.aggregation)}"`);
  if (p.date !== undefined) {
    if (!isRecord(p.date) || !DATE_LEVELS.includes(p.date.level as never) || !['part', 'trunc'].includes(String(p.date.mode))) {
      out.push(`${where}: bad date treatment`);
    }
  }
  if (p.bin !== undefined) {
    const b = p.bin as Record<string, unknown>;
    const ok = isRecord(b) && ((typeof b.size === 'number' && b.size > 0) || (typeof b.count === 'number' && b.count > 0));
    if (!ok) out.push(`${where}: bad bin`);
  }
  if (fields && typeof p.field === 'string' && !fields.has(p.field)) {
    out.push(`${where}: unknown field "${p.field}"`);
  }
}

function validateFilter(f: unknown, index: number, pillIds: Set<string>, out: string[]): void {
  const where = `filters[${index}]`;
  if (!isRecord(f)) { out.push(`${where}: not an object`); return; }
  const fs = f as Partial<FilterSpec>;
  if (!FILTER_KINDS.has(String(fs.kind))) out.push(`${where}: bad kind "${String(fs.kind)}"`);
  if (typeof fs.field !== 'string') out.push(`${where}: missing field`);
  if (typeof fs.pillId !== 'string' || !pillIds.has(fs.pillId)) out.push(`${where}: pillId does not match a pill on the filters shelf`);
  if (fs.kind === 'topN' && !(typeof (fs as { n?: unknown }).n === 'number' && (fs as { n: number }).n > 0)) out.push(`${where}: topN needs n > 0`);
}

/**
 * Validate a spec. When `meta` is given, every pill's field must exist.
 * @returns list of problems; empty when valid.
 */
export function validateSpec(spec: unknown, meta?: FieldMeta[]): string[] {
  const out: string[] = [];
  if (!isRecord(spec)) return ['spec is not an object'];
  const s = spec as Partial<VizSpec>;
  if (s.version !== SPEC_VERSION) out.push(`version ${String(s.version)} ≠ ${SPEC_VERSION}`);
  if (typeof s.datasetId !== 'string' || !s.datasetId) out.push('missing datasetId');
  if (!CHART_TYPE_IDS.includes(s.chartType as never)) out.push(`unknown chartType "${String(s.chartType)}"`);
  const fields = meta ? new Map(meta.map((m) => [m.name, m])) : null;

  if (!isRecord(s.shelves)) {
    out.push('missing shelves');
  } else {
    const shelves = s.shelves as Record<string, unknown>;
    for (const shelf of ALL_SHELVES) {
      const pills = shelves[shelf];
      if (!Array.isArray(pills)) { out.push(`shelves.${shelf}: missing`); continue; }
      if (SINGLE_PILL_SHELVES.has(shelf) && pills.length > 1) out.push(`shelves.${shelf}: holds at most one pill`);
      pills.forEach((p, i) => validatePill(p, shelf, i, fields, out));
    }
    for (const key of Object.keys(shelves)) {
      if (!ALL_SHELVES.includes(key as ShelfId)) out.push(`shelves.${key}: unknown shelf`);
    }
    const filterPills = Array.isArray(shelves.filters) ? (shelves.filters as Pill[]) : [];
    const pillIds = new Set(filterPills.map((p) => p?.id).filter((x): x is string => typeof x === 'string'));
    if (!Array.isArray(s.filters)) out.push('missing filters');
    else s.filters.forEach((f, i) => validateFilter(f, i, pillIds, out));
  }

  if (!isRecord(s.palette) || !['auto', 'manual'].includes(String(s.palette.mode))) out.push('bad palette');
  if (!isRecord(s.marks)) out.push('missing marks');
  if (!isRecord(s.axes) || !isRecord(s.axes.x) || !isRecord(s.axes.y)) out.push('missing axes');
  if (!isRecord(s.legend)) out.push('missing legend');
  if (!isRecord(s.fieldFormats)) out.push('missing fieldFormats');
  if (!isRecord(s.typeOverrides)) out.push('missing typeOverrides');
  return out;
}

/** True when `validateSpec` reports nothing. */
export function isValidSpec(spec: unknown, meta?: FieldMeta[]): spec is VizSpec {
  return validateSpec(spec, meta).length === 0;
}
