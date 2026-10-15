/**
 * Pill label rules (docs/TABLEAU-SPEC.md §2–§4): what a pill reads on a shelf.
 * Pure; shared by Pill.svelte, the field-list keyboard menu and the tests.
 */
import type { Aggregation, DateLevel, Pill } from '../../core/types';
import { AGGREGATION_LABEL } from '../../core/constants';

/** Date level prefixes as Tableau prints them on a pill. */
export const DATE_LEVEL_LABEL: Record<DateLevel, string> = {
  year: 'YEAR', quarter: 'QUARTER', month: 'MONTH', week: 'WEEK', day: 'DAY', hour: 'HOUR', minute: 'MINUTE',
};

/** Menu wording for date levels. */
export const DATE_LEVEL_MENU: Record<DateLevel, string> = {
  year: 'Year', quarter: 'Quarter', month: 'Month', week: 'Week', day: 'Day', hour: 'Hour', minute: 'Minute',
};

/** Menu wording for aggregations. */
export const AGGREGATION_MENU: Record<Aggregation, string> = {
  sum: 'Sum', avg: 'Average', median: 'Median', count: 'Count', countd: 'Count (Distinct)',
  min: 'Minimum', max: 'Maximum', stdev: 'Std. Dev', var: 'Variance', none: 'Disaggregate',
};

/** The name shown inside the parentheses: alias wins over the field name. */
export function pillName(pill: Pill): string {
  return pill.alias?.trim() || pill.field;
}

/**
 * Pill text: `SUM(price)` for an aggregated measure, `price` when
 * disaggregated, `YEAR(ts)` for a date pill (part or trunc), `price (bin)`
 * for a binned measure, and the bare name for a dimension.
 */
export function pillLabel(pill: Pill): string {
  const name = pillName(pill);
  if (pill.date) return `${DATE_LEVEL_LABEL[pill.date.level]}(${name})`;
  if (pill.bin) return `${name} (bin)`;
  if (pill.role === 'measure') {
    const agg = AGGREGATION_LABEL[pill.aggregation];
    return agg ? `${agg}(${name})` : name;
  }
  return name;
}

/** Accessible description of a pill: label plus its continuity. */
export function pillDescription(pill: Pill): string {
  return `${pillLabel(pill)}, ${pill.continuity}${pill.date ? `, date ${pill.date.mode}` : ''}`;
}
