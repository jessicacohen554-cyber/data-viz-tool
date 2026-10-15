/**
 * Value formatters for a field under a `FormatSpec` (docs/TABLEAU-SPEC.md §7–§8).
 *
 * Owns `makeFormatter(meta, spec)` (frozen signature; label / tooltip / table
 * context), `makeAxisFormatter(meta, spec, axisMax)` (axis ticks: shared
 * `auto` unit), `autoFormat(meta)` (the field's automatic spec) and
 * `autoDateFormat(treatment)` (a continuous date pill's spec by level).
 * Delegates numbers to `number-format.ts` and dates to `date-format.ts`.
 * Framework-free [R-PURE].
 */
import type { DateTreatment, FieldMeta, FormatSpec } from '../core/types';
import { formatNumber, type NumberFormatContext } from './number-format';
import { AUTO_DATETIME_PATTERN, AUTO_DATE_PATTERN, TRUNC_PATTERNS, compileDatePattern } from './date-format';

/** Value formatter; raw numbers/epoch-ms/strings in, display string out. */
export type ValueFormatter = (value: number | string | boolean | null) => string;

/** Default boolean labels (§7.1). */
export const DEFAULT_BOOLEAN_LABELS: [string, string] = ['True', 'False'];

/** True when the field's numbers are whole (integer storage). */
function isIntegerField(meta: FieldMeta): boolean {
  return meta.type === 'integer' || meta.storage === 'i32';
}

/** True when the field holds epoch-ms dates. */
function isDateField(meta: FieldMeta): boolean {
  return meta.type === 'date' || meta.type === 'datetime' || meta.storage === 'date';
}

/** Builds the formatter shared by label and axis contexts. */
function build(meta: FieldMeta, spec: FormatSpec, ctx: NumberFormatContext): ValueFormatter {
  const labels = spec.booleanLabels ?? DEFAULT_BOOLEAN_LABELS;
  const bool = (b: boolean): string => (b ? labels[0] : labels[1]);

  if (spec.kind === 'boolean' || (spec.kind === 'automatic' && meta.type === 'boolean')) {
    return (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return bool(v);
      if (typeof v === 'number') return Number.isNaN(v) ? '' : bool(v !== 0);
      return v;
    };
  }

  if (spec.kind === 'date' || (spec.kind === 'automatic' && isDateField(meta))) {
    const pattern = spec.datePattern ?? (meta.type === 'datetime' ? AUTO_DATETIME_PATTERN : AUTO_DATE_PATTERN);
    const render = compileDatePattern(pattern);
    return (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return render(v);
      if (typeof v === 'boolean') return bool(v);
      return v;
    };
  }

  const numCtx: NumberFormatContext = { ...ctx, integer: isIntegerField(meta) };
  return (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return formatNumber(v, spec, numCtx);
    if (typeof v === 'boolean') return bool(v);
    return v;
  };
}

/**
 * Build a formatter for a field under a FormatSpec (defaults to `automatic`).
 * Label / tooltip / table context: `units: 'auto'` means `none` here.
 * `null`/`undefined` → `''`; strings pass through; booleans use the labels.
 */
export function makeFormatter(meta: FieldMeta, spec?: FormatSpec): ValueFormatter {
  return build(meta, spec ?? autoFormat(meta), {});
}

/**
 * Build an axis-tick formatter: `automatic` and `units: 'auto'` resolve one
 * unit from `axisMax` so every tick shares it (`1.2M`, §7.1).
 */
export function makeAxisFormatter(meta: FieldMeta, spec: FormatSpec | undefined, axisMax: number): ValueFormatter {
  return build(meta, spec ?? autoFormat(meta), { axis: true, axisMax });
}

/**
 * The automatic FormatSpec for a field: numbers → thousands and up to 2
 * decimals (trailing zeros trimmed), integers → 0 decimals, dates →
 * `yyyy-MM-dd` / `yyyy-MM-dd HH:mm:ss`, booleans → True/False.
 */
export function autoFormat(meta: FieldMeta): FormatSpec {
  switch (meta.type) {
    case 'integer': return { kind: 'automatic', thousands: true, decimals: 0 };
    case 'number': return { kind: 'automatic', thousands: true, decimals: 2 };
    case 'date': return { kind: 'date', datePattern: AUTO_DATE_PATTERN };
    case 'datetime': return { kind: 'date', datePattern: AUTO_DATETIME_PATTERN };
    case 'boolean': return { kind: 'boolean', booleanLabels: [...DEFAULT_BOOLEAN_LABELS] };
    default: return { kind: 'automatic' };
  }
}

/**
 * The automatic FormatSpec for a continuous (`trunc`) date pill: the §4.2
 * start-of-period pattern of its level (`Q yyyy`, `MMM yyyy`, …). A `part`
 * pill's values are category codes labelled by `datePartLabel()`, so it gets
 * `automatic`.
 */
export function autoDateFormat(treatment: DateTreatment): FormatSpec {
  return treatment.mode === 'trunc'
    ? { kind: 'date', datePattern: TRUNC_PATTERNS[treatment.level] }
    : { kind: 'automatic' };
}
