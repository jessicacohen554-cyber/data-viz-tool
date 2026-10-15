/**
 * Factories for contract objects: a default VizSpec, a pill from a field, and
 * default role/continuity/aggregation per data type (docs/TABLEAU-SPEC.md).
 */
import type {
  Aggregation, AxisSpec, Continuity, DataType, FieldMeta, MarkSettings, PaletteSelection, Pill,
  Role, ShelfId, VizSpec,
} from './types';
import { ALL_SHELVES, DEFAULT_CHART, SPEC_VERSION } from './constants';

/** Default role by data type (Tableau: numbers are measures, everything else a dimension). */
export function defaultRole(type: DataType): Role {
  return type === 'number' || type === 'integer' ? 'measure' : 'dimension';
}

/** Default continuity by role (measure → continuous, dimension → discrete). */
export function defaultContinuity(role: Role): Continuity {
  return role === 'measure' ? 'continuous' : 'discrete';
}

/** Default aggregation by role (measure → SUM, dimension → COUNT). */
export function defaultAggregation(role: Role): Aggregation {
  return role === 'measure' ? 'sum' : 'count';
}

/** RFC 4122 v4 id; falls back to Math.random when crypto.randomUUID is unavailable (older WebViews). */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Create a pill for a field dropped on a shelf. Date fields default to discrete YEAR part. */
export function newPill(meta: FieldMeta, shelf: ShelfId): Pill {
  const role = shelf === 'filters' ? meta.role : meta.role;
  const pill: Pill = {
    id: newId(),
    field: meta.name,
    role,
    continuity: meta.defaultContinuity,
    aggregation: meta.defaultAggregation,
  };
  if (meta.type === 'date' || meta.type === 'datetime') {
    pill.date = { level: 'year', mode: 'part' };
    pill.continuity = 'discrete';
  }
  return pill;
}

/** Default mark settings. */
export function defaultMarks(): MarkSettings {
  return {
    opacity: 1,
    sizeRange: [6, 40],
    stacking: 'none',
    lineWidth: 2,
    smooth: false,
    showPoints: false,
    labels: { show: false, position: 'auto' },
    barGap: 0.2,
    nullHandling: 'break',
    extra: {},
  };
}

/** Default axis settings. */
export function defaultAxis(): AxisSpec {
  return { log: false, reversed: false, gridlines: true, showAxis: true };
}

/** Default palette selection (auto by continuity; Observatory categorical per D-10). */
export function defaultPalette(): PaletteSelection {
  return { mode: 'auto' };
}

/** Empty shelves record with every shelf present. */
export function emptyShelves(): Record<ShelfId, Pill[]> {
  const shelves = {} as Record<ShelfId, Pill[]>;
  for (const s of ALL_SHELVES) shelves[s] = [];
  return shelves;
}

/** A fresh text-table worksheet on the given dataset. */
export function createDefaultSpec(datasetId: string): VizSpec {
  return {
    version: SPEC_VERSION,
    datasetId,
    title: '',
    chartType: DEFAULT_CHART,
    shelves: emptyShelves(),
    filters: [],
    typeOverrides: {},
    palette: defaultPalette(),
    marks: defaultMarks(),
    axes: { x: defaultAxis(), y: defaultAxis() },
    legend: { show: true, position: 'right' },
    fieldFormats: {},
  };
}

/** Deep clone via structured clone (specs are plain JSON). */
export function cloneSpec(spec: VizSpec): VizSpec {
  return JSON.parse(JSON.stringify(spec)) as VizSpec;
}
