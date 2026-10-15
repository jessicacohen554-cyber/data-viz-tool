/**
 * STUB (S0) — replaced by shard S2. Signature is frozen:
 * `makeFormatter(meta, spec)` returns a function that renders one raw value.
 */
import type { FieldMeta, FormatSpec } from '../core/types';

/** Value formatter; raw numbers/epoch-ms/strings in, display string out. */
export type ValueFormatter = (value: number | string | boolean | null) => string;

/** Build a formatter for a field under a FormatSpec (defaults to `automatic`). */
export function makeFormatter(_meta: FieldMeta, _spec?: FormatSpec): ValueFormatter {
  return (v) => (v === null || v === undefined ? '' : String(v));
}

/** The automatic FormatSpec for a field (number → 2 decimals with thousands; date → by level). */
export function autoFormat(_meta: FieldMeta): FormatSpec {
  return { kind: 'automatic' };
}
