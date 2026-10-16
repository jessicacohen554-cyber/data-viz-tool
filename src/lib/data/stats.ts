/**
 * Descriptive statistics over a numeric vector (shard T1).
 *
 * `quantile` is the single percentile kernel of the data layer: the engine's
 * MEDIAN / P5…P95 aggregations, boxplot statistics and envelope bands all call
 * it, so every percentile in the app is computed one way — linear interpolation
 * between the two nearest order statistics (Hyndman–Fan type 7, the default of
 * R, NumPy and Excel's PERCENTILE.INC, and Tableau's PERCENTILE). For an even
 * count the median is the mean of the two middle values; for n = 1 every
 * percentile is that value.
 *
 * `summary` feeds reference lines (average / median / percentile / band) from
 * a result measure: NaN entries are ignored, so a result vector with null
 * groups can be passed as is.
 *
 * Main-thread-safe and framework-free (R-PURE): no DOM, no svelte, no ECharts.
 */

/**
 * Type-7 quantile of the ascending-sorted slice `sorted[a, b)` at `p` ∈ [0, 1].
 * Empty slice → NaN. `p` outside [0, 1] is clamped.
 */
export function quantile(sorted: Float64Array, a: number, b: number, p: number): number {
  const n = b - a;
  if (n <= 0) return NaN;
  if (p <= 0) return sorted[a]!;
  if (p >= 1) return sorted[b - 1]!;
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const frac = pos - lo;
  const v0 = sorted[a + lo]!;
  if (frac === 0 || lo + 1 >= n) return v0;
  return v0 + frac * (sorted[a + lo + 1]! - v0);
}

/** Result of `summary`: every statistic is NaN when no finite value exists. */
export interface Summary {
  /** Finite (non-NaN) values counted. */
  count: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  p25: number;
  p75: number;
  /** Type-7 percentile at `p` ∈ [0, 100] over the same finite values. */
  percentile(p: number): number;
}

/**
 * Summarise a vector, ignoring NaN (null groups / null rows). Sorts one private
 * copy of the finite values, so `percentile(p)` is O(1) afterwards.
 */
export function summary(values: Float64Array | readonly number[]): Summary {
  let count = 0;
  for (let i = 0; i < values.length; i++) { const v = values[i]!; if (v === v) count++; }
  const sorted = new Float64Array(count);
  let k = 0, sum = 0;
  for (let i = 0; i < values.length; i++) { const v = values[i]!; if (v === v) { sorted[k++] = v; sum += v; } }
  sorted.sort();
  const q = (p: number) => quantile(sorted, 0, count, p);
  return {
    count,
    min: count ? sorted[0]! : NaN,
    max: count ? sorted[count - 1]! : NaN,
    avg: count ? sum / count : NaN,
    median: q(0.5),
    p25: q(0.25),
    p75: q(0.75),
    percentile: (p: number) => q(p / 100),
  };
}
