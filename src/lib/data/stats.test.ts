import { describe, expect, it } from 'vitest';
import { quantile, summary } from './stats';

/** Independent type-7 reference on a plain array. */
function ref(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  const pos = (n - 1) * p, lo = Math.floor(pos);
  return s[lo]! + (pos - lo) * ((s[lo + 1] ?? s[lo]!) - s[lo]!);
}

describe('quantile (type 7)', () => {
  it('interpolates linearly between order statistics on a slice', () => {
    const sorted = Float64Array.from([-1, 10, 20, 30, 40, 99]);
    // slice [1, 5) = 10 20 30 40
    expect(quantile(sorted, 1, 5, 0)).toBe(10);
    expect(quantile(sorted, 1, 5, 1)).toBe(40);
    expect(quantile(sorted, 1, 5, 0.5)).toBe(25);
    expect(quantile(sorted, 1, 5, 0.25)).toBe(17.5);
    expect(quantile(sorted, 1, 5, 0.75)).toBe(32.5);
    expect(quantile(sorted, 1, 5, 0.05)).toBeCloseTo(11.5, 12);
    expect(quantile(sorted, 1, 5, 0.95)).toBeCloseTo(38.5, 12);
  });

  it('handles empty, single and two-element slices and clamps p', () => {
    const s = Float64Array.from([3, 7]);
    expect(quantile(s, 0, 0, 0.5)).toBeNaN();
    expect(quantile(s, 0, 1, 0.05)).toBe(3);
    expect(quantile(s, 0, 1, 0.95)).toBe(3);
    expect(quantile(s, 0, 2, 0.5)).toBe(5);
    expect(quantile(s, 0, 2, -1)).toBe(3);
    expect(quantile(s, 0, 2, 2)).toBe(7);
  });

  it('matches the brute-force reference at every PERCENTILE level on odd and even counts', () => {
    const odd = [5, 1, 9, 3, 7, 2, 8], even = [4, 8, 15, 16, 23, 42];
    for (const vals of [odd, even]) {
      const sorted = Float64Array.from(vals).sort();
      for (const p of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]) expect(quantile(sorted, 0, sorted.length, p)).toBeCloseTo(ref(vals, p), 12);
    }
  });
});

describe('summary', () => {
  it('ignores NaN and reports the five-number statistics plus avg and count', () => {
    const s = summary(Float64Array.from([NaN, 4, 8, NaN, 15, 16, 23, 42, NaN]));
    expect(s.count).toBe(6);
    expect(s.min).toBe(4);
    expect(s.max).toBe(42);
    expect(s.avg).toBe(18);
    expect(s.median).toBe(15.5);
    expect(s.p25).toBe(9.75);
    expect(s.p75).toBe(21.25);
    expect(s.percentile(50)).toBe(15.5);
    expect(s.percentile(0)).toBe(4);
    expect(s.percentile(100)).toBe(42);
    expect(s.percentile(95)).toBeCloseTo(ref([4, 8, 15, 16, 23, 42], 0.95), 12);
  });

  it('accepts plain arrays and is all-NaN for no finite values', () => {
    expect(summary([2, 1, 3]).median).toBe(2);
    const e = summary(Float64Array.from([NaN, NaN]));
    expect(e.count).toBe(0);
    for (const v of [e.min, e.max, e.avg, e.median, e.p25, e.p75, e.percentile(10)]) expect(v).toBeNaN();
    const one = summary([7]);
    expect([one.min, one.max, one.avg, one.median, one.p25, one.p75, one.percentile(3)]).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });

  it('does not mutate its input', () => {
    const v = Float64Array.from([3, 1, 2]);
    summary(v);
    expect(Array.from(v)).toEqual([3, 1, 2]);
  });
});
