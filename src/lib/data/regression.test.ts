import { describe, expect, it } from 'vitest';
import { POLY_DEGREE_MAX, POLY_DEGREE_MIN, fit } from './regression';

const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const close = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);

describe('fit: linear', () => {
  it('recovers an exact line with R² = 1 and prints the equation', () => {
    const f = fit(xs, xs.map((x) => 3 - 2 * x), 'linear');
    close(f.coef[0]!, 3); close(f.coef[1]!, -2);
    close(f.r2, 1, 12);
    close(f.predict(12), -21);
    expect(f.equation).toBe('y = 3 - 2x');
    expect(f.n).toBe(10);
  });

  it('matches the closed-form slope and intercept on noisy data and reports R² in (0, 1)', () => {
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18.0, 20.2];
    const n = xs.length, mx = 5.5, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i]! - mx) ** 2; sxy += (xs[i]! - mx) * (ys[i]! - my); }
    const b = sxy / sxx, a = my - b * mx;
    const f = fit(xs, ys, 'linear');
    close(f.coef[0]!, a); close(f.coef[1]!, b);
    expect(f.r2).toBeGreaterThan(0.99); expect(f.r2).toBeLessThan(1);
  });

  it('ignores non-finite pairs and is degenerate for constant x or a single point', () => {
    const f = fit([1, 2, NaN, 3, 4], [1, 2, 99, 3, Infinity], 'linear');
    expect(f.n).toBe(3);
    close(f.coef[1]!, 1);
    const c = fit([2, 2, 2], [1, 2, 3], 'linear');
    expect(c.coef.every((v) => Number.isNaN(v))).toBe(true);
    expect(c.r2).toBeNaN(); expect(c.predict(1)).toBeNaN(); expect(c.equation).toBe('');
    expect(fit([1], [1], 'linear').r2).toBeNaN();
    expect(fit([], [], 'poly', 3).coef).toHaveLength(4);
  });

  it('a horizontal line has R² = 1 when residuals vanish', () => {
    const f = fit(xs, xs.map(() => 4), 'linear');
    close(f.coef[0]!, 4); close(f.coef[1]!, 0);
    expect(f.r2).toBe(1);
    expect(f.equation).toBe('y = 4');
  });
});

describe('fit: log', () => {
  it('recovers y = a + b ln x exactly and drops x ≤ 0', () => {
    const x = [0, -1, ...xs], y = x.map((v) => 1.5 + 2.5 * Math.log(v));
    const f = fit(x, y, 'log');
    expect(f.n).toBe(10);
    close(f.coef[0]!, 1.5); close(f.coef[1]!, 2.5);
    close(f.r2, 1, 12);
    close(f.predict(Math.E), 4);
    expect(f.predict(0)).toBeNaN();
    expect(f.equation).toBe('y = 1.5 + 2.5ln(x)');
  });
});

describe('fit: exp', () => {
  it('recovers y = a·e^(bx) exactly, drops y ≤ 0, and prints the multiplier form', () => {
    const y = xs.map((x) => 2 * Math.exp(0.3 * x));
    const f = fit([...xs, 11, 12], [...y, 0, -5], 'exp');
    expect(f.n).toBe(10);
    close(f.coef[0]!, 2); close(f.coef[1]!, 0.3);
    close(f.r2, 1, 12);
    close(f.predict(0), 2);
    expect(f.equation).toBe('y = 2e^(0.3x)');
  });

  it('reports R² in log space (the fitted space)', () => {
    const y = [1, 2.9, 9.2, 26, 82];
    const f = fit([0, 1, 2, 3, 4], y, 'exp');
    const ly = y.map(Math.log), mean = ly.reduce((a, b) => a + b, 0) / 5;
    const pred = [0, 1, 2, 3, 4].map((x) => Math.log(f.coef[0]!) + f.coef[1]! * x);
    const ssTot = ly.reduce((a, v) => a + (v - mean) ** 2, 0), ssRes = ly.reduce((a, v, i) => a + (v - pred[i]!) ** 2, 0);
    close(f.r2, 1 - ssRes / ssTot, 12);
  });
});

describe('fit: poly', () => {
  const polys: number[][] = [
    [1, -2, 0.5],
    [3, 0, -1, 0.25],
    [-2, 1, 0, 0, 0.1],
    [0.5, -1, 2, -0.3, 0.02, 0.001],
  ];
  const evalPoly = (c: readonly number[], v: number) => c.reduce((acc, ck, k) => acc + ck * v ** k, 0);

  it('recovers exact polynomials of degree 2…5 with R² = 1 and raw-x coefficients', () => {
    const x = Array.from({ length: 40 }, (_, i) => -5 + i * 0.5);
    for (const c of polys) {
      const d = c.length - 1;
      const f = fit(x, x.map((v) => evalPoly(c, v)), 'poly', d);
      expect(f.coef).toHaveLength(d + 1);
      c.forEach((ck, k) => expect(f.coef[k]!).toBeCloseTo(ck, 8));
      close(f.r2, 1, 12);
      close(f.predict(3.21), evalPoly(c, 3.21), 9);
    }
  });

  it('stays exact in prediction far from the origin (x scaled to [−1, 1]); expanded coefficients are close', () => {
    const x = Array.from({ length: 40 }, (_, i) => 100 + i * 7.5);
    for (const c of polys) {
      const d = c.length - 1;
      const f = fit(x, x.map((v) => evalPoly(c, v)), 'poly', d);
      close(f.r2, 1, 9);
      const at = 123.4, truth = evalPoly(c, at);
      expect(Math.abs(f.predict(at) - truth) / Math.abs(truth)).toBeLessThan(1e-9);
      const scale = Math.max(...c.map(Math.abs));
      c.forEach((ck, k) => expect(Math.abs(f.coef[k]! - ck) / scale).toBeLessThan(1e-3));
    }
  });

  it('clamps the degree to 2…5, defaults to 2 and needs degree + 1 points', () => {
    const y = xs.map((x) => 1 + x + x * x);
    expect(fit(xs, y, 'poly').coef).toHaveLength(3);
    expect(fit(xs, y, 'poly', 1).coef).toHaveLength(POLY_DEGREE_MIN + 1);
    expect(fit(xs, y, 'poly', 9).coef).toHaveLength(POLY_DEGREE_MAX + 1);
    expect(fit([1, 2, 3], [1, 4, 9], 'poly', 3).r2).toBeNaN();
    const exact = fit([1, 2, 3], [1, 4, 9], 'poly', 2);
    close(exact.coef[2]!, 1); close(exact.r2, 1, 9);
  });

  it('prints ascending powers with zero terms dropped', () => {
    const f = fit(xs, xs.map((x) => 1 - 2 * x + 0.5 * x * x), 'poly', 2);
    expect(f.equation).toBe('y = 1 - 2x + 0.5x^2');
    const g = fit(xs, xs.map((x) => x * x), 'poly', 2);
    expect(g.equation).toBe('y = x^2');
  });
});
