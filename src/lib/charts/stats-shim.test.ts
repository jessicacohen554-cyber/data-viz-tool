import { describe, expect, it } from 'vitest';
import { fit, summary } from './stats-shim';

describe('summary', () => {
  it('order statistics with linear interpolation (Tableau PERCENTILE)', () => {
    const s = summary([4, 1, 3, 2]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
    expect(s.avg).toBe(2.5);
    expect(s.median).toBe(2.5);
    expect(s.p25).toBe(1.75);
    expect(s.p75).toBe(3.25);
    expect(s.percentile(0)).toBe(1);
    expect(s.percentile(100)).toBe(4);
  });

  it('ignores NaN and returns NaN fields for an empty sample', () => {
    expect(summary(Float64Array.from([NaN, 2, NaN])).avg).toBe(2);
    const e = summary([]);
    expect(Number.isNaN(e.min)).toBe(true);
    expect(Number.isNaN(e.percentile(50))).toBe(true);
  });
});

describe('fit', () => {
  it('linear: recovers slope and intercept exactly with R² 1', () => {
    const f = fit([0, 1, 2, 3], [1, 3, 5, 7], 'linear');
    expect(f.coef[0]).toBeCloseTo(1);
    expect(f.coef[1]).toBeCloseTo(2);
    expect(f.r2).toBeCloseTo(1);
    expect(f.predict(10)).toBeCloseTo(21);
    expect(f.equation).toBe('y = 1 + 2·x');
  });

  it('poly degree 2 recovers y = x² and the degree is clamped to 2..5', () => {
    const xs = [0, 1, 2, 3, 4]; const ys = xs.map((x) => x * x);
    const f = fit(xs, ys, 'poly', 2);
    expect(f.coef.map((c) => Math.round(c * 1e6) / 1e6 + 0)).toEqual([0, 0, 1]);
    expect(f.predict(5)).toBeCloseTo(25);
    // Degree 9 is clamped to 5, which needs more than 5 points.
    const xs7 = [0, 1, 2, 3, 4, 5, 6];
    expect(fit(xs7, xs7.map((x) => x * x), 'poly', 9).coef).toHaveLength(6);
    expect(fit(xs, ys, 'poly', 9).coef).toEqual([]);
  });

  it('exp recovers a·e^(b·x); log recovers a + b·ln x; non-positive points are skipped', () => {
    const xs = [0, 1, 2, 3];
    const e = fit(xs, xs.map((x) => 2 * Math.exp(0.5 * x)), 'exp');
    expect(e.coef[0]).toBeCloseTo(2);
    expect(e.coef[1]).toBeCloseTo(0.5);
    const lx = [1, 2, 4, 8];
    const l = fit(lx, lx.map((x) => 3 + 2 * Math.log(x)), 'log');
    expect(l.coef[0]).toBeCloseTo(3);
    expect(l.coef[1]).toBeCloseTo(2);
    expect(fit([-1, 0, 1, 2], [1, 1, 5, 7], 'log').coef).toHaveLength(2);
    expect(Number.isNaN(l.predict(0))).toBe(true);
  });

  it('too few points → no coefficients, NaN R², NaN predictions', () => {
    const f = fit([1], [2], 'linear');
    expect(f.coef).toEqual([]);
    expect(Number.isNaN(f.r2)).toBe(true);
    expect(Number.isNaN(f.predict(1))).toBe(true);
    expect(fit([0, 1, 2], [0, 1, 4], 'poly', 3).coef).toEqual([]);
  });

  it('R² is below 1 for noisy data and 0 when the fit explains nothing', () => {
    const f = fit([0, 1, 2, 3], [1, 3, 2, 4], 'linear');
    expect(f.r2).toBeGreaterThan(0);
    expect(f.r2).toBeLessThan(1);
    expect(fit([0, 1, 2, 3], [5, 5, 5, 5], 'linear').r2).toBe(1);
  });
});
