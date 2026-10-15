/**
 * STUB (S0) — replaced by shard S3. Signatures are frozen.
 * "Show Me": which chart types the current pills can drive, and a suggestion.
 */
import type { ChartTypeId, FieldMeta, VizSpec } from '../core/types';
import { CHART_TYPE_IDS } from '../core/constants';

export interface Eligibility { id: ChartTypeId; ok: boolean; reason?: string }

/** Eligibility of every chart type for the spec's current pills. */
export function eligibility(_spec: VizSpec, _meta: FieldMeta[]): Eligibility[] {
  return CHART_TYPE_IDS.map((id) => ({ id, ok: true }));
}

/** Best chart for the current pills (bar → line if date → scatter if 2 measures → text-table). */
export function suggest(_spec: VizSpec, _meta: FieldMeta[]): ChartTypeId {
  return 'text-table';
}
