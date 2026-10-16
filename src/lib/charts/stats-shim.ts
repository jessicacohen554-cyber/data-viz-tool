/**
 * Local implementations of the two statistics entry points shard T1 ships in
 * `src/lib/data/regression.ts` (`fit`) and `src/lib/data/stats.ts`
 * (`summary`), with the same signatures, so the chart layer compiles and
 * works before T1 lands. When T1's modules exist the integrator re-points the
 * two imports (`decorations.ts`) and deletes this file (rule R-DELETE).
 * Framework-free (rule R-PURE).
 */

/** Result of `fit`: coefficients in model order, R² on the fitted points, a predictor and a display equation. */
export interface Fit {
  coef: number[];
  r2: number;
  predict: (x: number) => number;
  equation: string;
}

/** Order statistics of a numeric sample (non-finite values ignored). */
export interface Summary {
  min: number;
  max: number;
  avg: number;
  median: number;
  p25: number;
  p75: number;
  /** Linear-interpolated percentile at `p` ∈ 0..100 (Tableau PERCENTILE). */
  percentile: (p: number) => number;
}

/** Regression models (constants.ts `TREND_MODELS`). */
export type FitModel = 'linear' | 'log' | 'exp' | 'poly';

/** Linear-interpolated percentile of a sorted sample. */
function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (Math.max(0, Math.min(100, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

/** Summary statistics of `values`; every field is `NaN` for an empty (or all non-finite) sample. */
export function summary(values: ArrayLike<number>): Summary {
  const sorted: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) { const v = values[i]!; if (Number.isFinite(v)) { sorted.push(v); sum += v; } }
  sorted.sort((a, b) => a - b);
  const percentile = (p: number) => quantileSorted(sorted, p);
  return {
    min: sorted.length ? sorted[0]! : NaN,
    max: sorted.length ? sorted[sorted.length - 1]! : NaN,
    avg: sorted.length ? sum / sorted.length : NaN,
    median: percentile(50),
    p25: percentile(25),
    p75: percentile(75),
    percentile,
  };
}

/** Solve `A·x = b` by Gaussian elimination with partial pivoting; `null` when singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) return null;
    if (piv !== col) { const t = M[piv]!; M[piv] = M[col]!; M[col] = t; }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Least-squares polynomial `y = c0 + c1 x + … + cd x^d` through the normal equations. */
function polyFit(xs: number[], ys: number[], degree: number): number[] | null {
  const d = degree;
  const A: number[][] = Array.from({ length: d + 1 }, () => new Array<number>(d + 1).fill(0));
  const b = new Array<number>(d + 1).fill(0);
  const pow = new Array<number>(2 * d + 1).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!; const y = ys[i]!;
    let xp = 1;
    for (let k = 0; k <= 2 * d; k++) { pow[k] = pow[k]! + xp; if (k <= d) b[k] = b[k]! + y * xp; xp *= x; }
  }
  for (let r = 0; r <= d; r++) for (let c = 0; c <= d; c++) A[r]![c] = pow[r + c]!;
  return solve(A, b);
}

/** Format a coefficient with 4 significant digits, trimming trailing zeros. */
function num(v: number): string {
  if (!Number.isFinite(v)) return 'NaN';
  const s = Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(3) : v.toPrecision(4);
  return s.includes('e') ? s : String(Number(s));
}

/** `+ c` / `- c` for equation strings. */
function signed(v: number): string {
  return v < 0 ? ` - ${num(-v)}` : ` + ${num(v)}`;
}

const NO_FIT: Fit = { coef: [], r2: NaN, predict: () => NaN, equation: '' };

/**
 * Least-squares fit of `ys` on `xs`. `linear`: y = a + b·x; `log`: y = a + b·ln x
 * (x ≤ 0 skipped); `exp`: y = a·e^(b·x) fitted on ln y (y ≤ 0 skipped);
 * `poly`: degree 2..5 (clamped). Non-finite pairs are skipped. With fewer than
 * two usable points (or a singular system) the result has no coefficients,
 * `r2` NaN and a predictor that returns NaN. R² is computed in y space.
 */
export function fit(xs: ArrayLike<number>, ys: ArrayLike<number>, model: FitModel, degree = 2): Fit {
  const X: number[] = []; const Y: number[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]!; const y = ys[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (model === 'log' && x <= 0) continue;
    if (model === 'exp' && y <= 0) continue;
    X.push(x); Y.push(y);
  }
  if (X.length < 2) return NO_FIT;
  let coef: number[] | null;
  let predict: (x: number) => number;
  let equation: string;
  if (model === 'poly') {
    const d = Math.max(2, Math.min(5, Math.round(degree)));
    if (X.length <= d) return NO_FIT;
    coef = polyFit(X, Y, d);
    if (!coef) return NO_FIT;
    const c = coef;
    predict = (x) => c.reduce((acc, ck, k) => acc + ck * x ** k, 0);
    equation = `y = ${num(c[0]!)}${c.slice(1).map((ck, k) => `${signed(ck)}·x${k + 1 > 1 ? `^${k + 1}` : ''}`).join('')}`;
  } else if (model === 'exp') {
    coef = polyFit(X, Y.map((y) => Math.log(y)), 1);
    if (!coef) return NO_FIT;
    const a = Math.exp(coef[0]!); const b = coef[1]!;
    coef = [a, b];
    predict = (x) => a * Math.exp(b * x);
    equation = `y = ${num(a)}·e^(${num(b)}·x)`;
  } else {
    const tx = model === 'log' ? X.map((x) => Math.log(x)) : X;
    coef = polyFit(tx, Y, 1);
    if (!coef) return NO_FIT;
    const a = coef[0]!; const b = coef[1]!;
    predict = model === 'log' ? (x) => (x > 0 ? a + b * Math.log(x) : NaN) : (x) => a + b * x;
    equation = model === 'log' ? `y = ${num(a)}${signed(b)}·ln(x)` : `y = ${num(a)}${signed(b)}·x`;
  }
  const mean = Y.reduce((t, y) => t + y, 0) / Y.length;
  let ssRes = 0; let ssTot = 0;
  for (let i = 0; i < X.length; i++) { const e = Y[i]! - predict(X[i]!); ssRes += e * e; const d = Y[i]! - mean; ssTot += d * d; }
  const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot;
  return { coef, r2, predict, equation };
}
