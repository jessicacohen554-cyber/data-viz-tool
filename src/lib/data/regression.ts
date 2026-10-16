/**
 * Trend-line regression (shard T1, owner ruling D-16): least-squares fits of
 * the four Tableau trend models over paired samples.
 *
 * | model    | equation                  | fitted by                                   |
 * |----------|---------------------------|---------------------------------------------|
 * | `linear` | y = a + b·x               | closed form on centred x                    |
 * | `log`    | y = a + b·ln(x)           | linear fit on ln(x); rows with x ≤ 0 dropped |
 * | `exp`    | y = a·e^(b·x)             | linear fit of ln(y) on x; rows with y ≤ 0 dropped |
 * | `poly`   | y = c₀ + c₁x + … + c_d x^d | normal equations on x scaled to [−1, 1], Gaussian elimination with partial pivoting; degree clamped to 2…5 |
 *
 * `coef` lists the printed equation's coefficients in that order (`[a, b]` or
 * `[c₀ … c_d]`), the raw least-squares solution. `r2` is the coefficient of
 * determination **in the space the model was fitted in** — for `exp` that is
 * ln(y), as Tableau and Excel report it. Rows with a non-finite x or y are
 * ignored. When fewer points than parameters remain (or x is constant), every
 * coefficient and `r2` are NaN, `predict` returns NaN and `equation` is empty;
 * nothing throws.
 *
 * `poly` predicts in the scaled variable (exact to double precision); the
 * raw-x `coef` are the algebraic expansion of that solution and, far from the
 * origin, carry the cancellation error of the expansion (≈ 1e-4 relative for
 * degree 5 at x ≈ 100…400; the 4-significant-digit equation is unaffected).
 * `equation` drops a term whose largest contribution
 * over the fitted x range is below 1e-9 of the dominant term's, so an exact
 * `x²` prints as `y = x^2`, not `y = -7e-15 + 2e-15x + x^2`.
 *
 * Main-thread-safe and framework-free (R-PURE).
 */
import type { TrendLine } from '../core/types';

/** Trend models (the `TrendLine.model` union). */
export type TrendModel = TrendLine['model'];

/** A fitted trend. */
export interface Fit {
  model: TrendModel;
  /** Coefficients of `equation`, in the order printed (see module doc). */
  coef: number[];
  /** R² in the fitted space; NaN when the fit is degenerate. */
  r2: number;
  /** Number of (x, y) pairs used after dropping non-finite / out-of-domain rows. */
  n: number;
  /** Evaluate the fitted curve. */
  predict(x: number): number;
  /** Human-readable equation, e.g. `y = 1.5 + 2x`, `y = 3e^(0.5x)`, `y = 1 - 2x + 0.5x^2`. */
  equation: string;
}

/** Lowest and highest polynomial degree accepted (the `TrendLine.degree` contract). */
export const POLY_DEGREE_MIN = 2;
export const POLY_DEGREE_MAX = 5;

type Pairs = { x: number[]; y: number[] };

function finitePairs(xs: ArrayLike<number>, ys: ArrayLike<number>, keep: (x: number, y: number) => boolean): Pairs {
  const n = Math.min(xs.length, ys.length);
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = xs[i]!, b = ys[i]!;
    if (Number.isFinite(a) && Number.isFinite(b) && keep(a, b)) { x.push(a); y.push(b); }
  }
  return { x, y };
}

function degenerate(model: TrendModel, params: number, n: number): Fit {
  return { model, coef: new Array<number>(params).fill(NaN), r2: NaN, n, predict: () => NaN, equation: '' };
}

/** R² of predictions against observations (1 − SS_res / SS_tot); 1 when SS_tot = 0 and SS_res = 0. */
function rSquared(y: readonly number[], yHat: readonly number[]): number {
  const n = y.length;
  let mean = 0;
  for (const v of y) mean += v;
  mean /= n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { const d = y[i]! - mean, r = y[i]! - yHat[i]!; ssTot += d * d; ssRes += r * r; }
  if (ssTot === 0) return ssRes <= 1e-12 * Math.max(1, Math.abs(mean)) ? 1 : NaN;
  return 1 - ssRes / ssTot;
}

/** Ordinary least squares y = a + b·x on centred x. Null when x is constant or n < 2. */
function ols(x: readonly number[], y: readonly number[]): { a: number; b: number } | null {
  const n = x.length;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]!; my += y[i]!; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i]! - mx; sxx += dx * dx; sxy += dx * (y[i]! - my); }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * Solve the dense system `A·c = rhs` in place by Gaussian elimination with
 * partial pivoting. Null when a pivot is (numerically) zero.
 */
function solve(A: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    if (Math.abs(A[piv]![col]!) < 1e-14) return null;
    if (piv !== col) { [A[piv], A[col]] = [A[col]!, A[piv]!]; [rhs[piv], rhs[col]] = [rhs[col]!, rhs[piv]!]; }
    for (let r = col + 1; r < n; r++) {
      const f = A[r]![col]! / A[col]![col]!;
      if (f === 0) continue;
      for (let k = col; k < n; k++) A[r]![k]! -= f * A[col]![k]!;
      rhs[r]! -= f * rhs[col]!;
    }
  }
  const c = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = rhs[r]!;
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * c[k]!;
    c[r] = s / A[r]![r]!;
  }
  return c;
}

/** Multiply two polynomials given as ascending coefficient arrays. */
function polyMul(p: readonly number[], q: readonly number[]): number[] {
  const out = new Array<number>(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) out[i + j]! += p[i]! * q[j]!;
  return out;
}

/** Significant-digit number for equations: `1.5`, `-0.0012`, `2.5e+7`, never `1.5000`. */
function num(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return 'NaN';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const s = abs >= 1e6 || abs < 1e-4 ? abs.toExponential(digits - 1) : abs.toPrecision(digits);
  const trimmed = s.includes('e') ? s.replace(/\.?0+e/, 'e') : s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return (v < 0 ? '-' : '') + trimmed;
}

/** `a + b·f` as text: `1.5 + 2x`, `3 - 0.5ln(x)`; a zero term is dropped, a unit coefficient written bare. */
function linearText(a: number, b: number, term: string): string {
  const head = num(a);
  if (b === 0) return head;
  const magText = num(Math.abs(b));
  const coefText = magText === '1' ? '' : magText;
  const sign = b < 0 ? ' - ' : ' + ';
  if (a === 0) return `${b < 0 ? '-' : ''}${coefText}${term}`;
  return `${head}${sign}${coefText}${term}`;
}

/**
 * Fit `model` to the paired samples. `degree` applies to `poly` only (default
 * 2, clamped to `POLY_DEGREE_MIN…POLY_DEGREE_MAX`). Never throws: a degenerate
 * input yields NaN coefficients and an empty equation (see module doc).
 */
export function fit(xs: ArrayLike<number>, ys: ArrayLike<number>, model: TrendModel, degree?: number): Fit {
  switch (model) {
    case 'linear': {
      const { x, y } = finitePairs(xs, ys, () => true);
      const s = ols(x, y);
      if (!s) return degenerate(model, 2, x.length);
      const predict = (v: number) => s.a + s.b * v;
      return { model, coef: [s.a, s.b], r2: rSquared(y, x.map(predict)), n: x.length, predict, equation: `y = ${linearText(s.a, s.b, 'x')}` };
    }
    case 'log': {
      const { x, y } = finitePairs(xs, ys, (a) => a > 0);
      const lx = x.map(Math.log);
      const s = ols(lx, y);
      if (!s) return degenerate(model, 2, x.length);
      const predict = (v: number) => (v > 0 ? s.a + s.b * Math.log(v) : NaN);
      return { model, coef: [s.a, s.b], r2: rSquared(y, lx.map((l) => s.a + s.b * l)), n: x.length, predict, equation: `y = ${linearText(s.a, s.b, 'ln(x)')}` };
    }
    case 'exp': {
      const { x, y } = finitePairs(xs, ys, (_, b) => b > 0);
      const ly = y.map(Math.log);
      const s = ols(x, ly);
      if (!s) return degenerate(model, 2, x.length);
      const a = Math.exp(s.a), b = s.b;
      const predict = (v: number) => a * Math.exp(b * v);
      const bText = num(Math.abs(b)) === '1' ? (b < 0 ? '-' : '') : num(b);
      return { model, coef: [a, b], r2: rSquared(ly, x.map((v) => s.a + s.b * v)), n: x.length, predict, equation: `y = ${num(a)}e^(${bText}x)` };
    }
    case 'poly': {
      const d = Math.min(POLY_DEGREE_MAX, Math.max(POLY_DEGREE_MIN, Math.round(degree ?? POLY_DEGREE_MIN)));
      const { x, y } = finitePairs(xs, ys, () => true);
      const n = x.length;
      if (n < d + 1) return degenerate(model, d + 1, n);
      let lo = Infinity, hi = -Infinity;
      for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi === lo) return degenerate(model, d + 1, n);
      // Scale x to u ∈ [−1, 1] so the normal matrix stays well conditioned for degree ≤ 5.
      const mid = (hi + lo) / 2, half = (hi - lo) / 2;
      const u = x.map((v) => (v - mid) / half);
      const m = d + 1;
      const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
      const rhs = new Array<number>(m).fill(0);
      const pow = new Array<number>(2 * d + 1);
      for (let i = 0; i < n; i++) {
        pow[0] = 1;
        for (let k = 1; k <= 2 * d; k++) pow[k] = pow[k - 1]! * u[i]!;
        for (let r = 0; r < m; r++) {
          rhs[r]! += pow[r]! * y[i]!;
          for (let c = 0; c < m; c++) A[r]![c]! += pow[r + c]!;
        }
      }
      const cu = solve(A, rhs);
      if (!cu) return degenerate(model, m, n);
      const predict = (v: number) => {
        const t = (v - mid) / half;
        let acc = 0;
        for (let k = d; k >= 0; k--) acc = acc * t + cu[k]!;
        return acc;
      };
      // Expand c(u) with u = (x − mid)/half into ascending powers of x for display.
      const coef = new Array<number>(m).fill(0);
      let basis = [1];
      const lin = [-mid / half, 1 / half];
      for (let k = 0; k <= d; k++) {
        for (let j = 0; j < basis.length; j++) coef[j]! += cu[k]! * basis[j]!;
        basis = polyMul(basis, lin);
      }
      return { model, coef, r2: rSquared(y, x.map(predict)), n, predict, equation: `y = ${polyText(tidy(coef, Math.max(Math.abs(lo), Math.abs(hi))))}` };
    }
  }
}

/** Display threshold: a term whose peak contribution over the x range is below this share of the largest term is noise. */
const DISPLAY_EPS = 1e-9;

/**
 * Ascending-power coefficients with numerically negligible terms zeroed for
 * display: term k's weight is |c_k|·xAbsMax^k against the largest such weight.
 */
function tidy(coef: readonly number[], xAbsMax: number): number[] {
  const scale = Math.max(1, xAbsMax);
  const weights = coef.map((c, k) => Math.abs(c) * scale ** k);
  const top = Math.max(...weights);
  if (!(top > 0)) return [...coef];
  return coef.map((c, k) => (weights[k]! < DISPLAY_EPS * top ? 0 : c));
}

/** Ascending-power polynomial as text: `1 - 2x + 0.5x^2`; zero terms dropped (all zero → `0`). */
function polyText(coef: readonly number[]): string {
  let s = '';
  coef.forEach((c, k) => {
    if (c === 0) return;
    const magText = num(Math.abs(c));
    const term = k === 0 ? '' : k === 1 ? 'x' : `x^${k}`;
    const body = k === 0 ? magText : magText === '1' ? term : `${magText}${term}`;
    if (s === '') s = (c < 0 ? '-' : '') + body;
    else s += `${c < 0 ? ' - ' : ' + '}${body}`;
  });
  return s === '' ? '0' : s;
}
