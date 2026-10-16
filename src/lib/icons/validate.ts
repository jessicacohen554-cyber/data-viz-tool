/**
 * Icon path validation (docs/ICONS.md §4). Parses an icon's `d`, checks the
 * command grammar and the 0..24 bounds, and rasterises the silhouette with the
 * nonzero rule to measure its ink and its thinnest features. `icons.test.ts`
 * runs every shipped icon through `validateIcon`; the parser and rasteriser
 * are exported so a future icon editor can reuse them. Pure arithmetic, no
 * DOM, no ECharts [R-PURE].
 */

/** The box every icon is drawn in. */
export const ICON_BOX = 24;

/** The only path commands an icon may use (absolute forms; `docs/ICONS.md` §4). */
export const ALLOWED_COMMANDS = 'MLHVCSQTAZ';

/** Minimum share of the 24 × 24 box an icon must ink (rejects hairline glyphs). */
export const MIN_COVERAGE = 0.08;

/** Minimum stroke/feature thickness in px: cells thinner than this count as "thin". */
export const MIN_WEIGHT_PX = 1.5;

/** Maximum share of ink cells that may be thin (sharp tips and arc edges). */
export const MAX_THIN_SHARE = 0.12;

/** Maximum distance of the bounding-box centre from the box centre, per axis, in px. */
export const MAX_CENTRE_OFFSET = 2.5;

/** Minimum bounding-box extent on each axis (px) so a mark is not a dot or a hairline. */
export const MIN_EXTENT = 6;

/** Supersampling factor of the rasteriser (cells per px). */
const SS = 2;

/** One parsed command with its absolute numeric arguments. */
export interface PathCommand {
  cmd: string;
  args: number[];
}

/** A point in icon coordinates. */
export type Point = [number, number];

/** Required argument count per command (`Z` takes none; repeated groups allowed). */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Tokenises an SVG path `d` into commands with absolute arguments. Throws on a
 * command outside `ALLOWED_COMMANDS` (including relative, lower-case forms),
 * on a malformed number, or on an argument count that is not a multiple of
 * the command's arity.
 */
export function parsePath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  const tokens = d.trim().match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const consumed = tokens.join('').replace(/\s+/g, '');
  if (consumed !== d.replace(/[\s,]+/g, '')) throw new Error(`unparseable path: ${d}`);
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    if (!/^[A-Za-z]$/.test(cmd)) throw new Error(`expected a command at token ${i - 1}: ${cmd}`);
    if (!ALLOWED_COMMANDS.includes(cmd)) throw new Error(`command ${cmd} is not allowed (absolute ${ALLOWED_COMMANDS} only)`);
    const args: number[] = [];
    while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]!)) args.push(Number(tokens[i++]));
    const n = ARITY[cmd]!;
    if (n === 0 ? args.length !== 0 : args.length === 0 || args.length % n !== 0) {
      throw new Error(`command ${cmd} takes ${n} arguments, got ${args.length}`);
    }
    if (args.some((a) => !Number.isFinite(a))) throw new Error(`non-finite argument after ${cmd}`);
    if (n === 0) out.push({ cmd, args: [] });
    else for (let k = 0; k < args.length; k += n) out.push({ cmd, args: args.slice(k, k + n) });
  }
  if (out.length === 0 || out[0]!.cmd !== 'M') throw new Error('path must start with M');
  return out;
}

/** Steps used to flatten one curve or arc segment. */
const CURVE_STEPS = 16;

function arcPoints(p0: Point, rx: number, ry: number, phiDeg: number, large: number, sweep: number, p1: Point): Point[] {
  // SVG 1.1 implementation notes F.6.5: endpoint to centre parameterisation.
  if (rx === 0 || ry === 0) return [p1];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let RX = Math.abs(rx);
  let RY = Math.abs(ry);
  const lambda = (x1 * x1) / (RX * RX) + (y1 * y1) / (RY * RY);
  if (lambda > 1) { RX *= Math.sqrt(lambda); RY *= Math.sqrt(lambda); }
  const num = RX * RX * RY * RY - RX * RX * y1 * y1 - RY * RY * x1 * x1;
  const den = RX * RX * y1 * y1 + RY * RY * x1 * x1;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * RX * y1) / RY;
  const cyp = (-coef * RY * x1) / RX;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cxp) / RX, (y1 - cyp) / RY);
  let delta = angle((x1 - cxp) / RX, (y1 - cyp) / RY, (-x1 - cxp) / RX, (-y1 - cyp) / RY);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(CURVE_STEPS, Math.ceil((Math.abs(delta) / (2 * Math.PI)) * 64));
  const pts: Point[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = theta1 + (delta * s) / steps;
    const ex = RX * Math.cos(t);
    const ey = RY * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  pts[pts.length - 1] = p1;
  return pts;
}

function cubicPoints(p0: Point, c1: Point, c2: Point, p1: Point): Point[] {
  const pts: Point[] = [];
  for (let s = 1; s <= CURVE_STEPS; s++) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
  return pts;
}

function quadPoints(p0: Point, c: Point, p1: Point): Point[] {
  const pts: Point[] = [];
  for (let s = 1; s <= CURVE_STEPS; s++) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}

/**
 * Flattens a parsed path into closed polylines, one per subpath (an open
 * subpath is closed implicitly, as the fill rule does). Curves and arcs are
 * sampled; control points are returned separately for the bounds check.
 */
export function flattenPath(commands: PathCommand[]): { subpaths: Point[][]; controls: Point[] } {
  const subpaths: Point[][] = [];
  const controls: Point[] = [];
  let cur: Point[] = [];
  let pos: Point = [0, 0];
  let start: Point = [0, 0];
  let lastCtrl: Point | null = null;
  let lastCmd = '';
  const close = () => { if (cur.length > 1) subpaths.push(cur); cur = []; };
  for (const { cmd, args } of commands) {
    let ctrl: Point | null = null;
    switch (cmd) {
      case 'M': close(); pos = [args[0]!, args[1]!]; start = pos; cur = [pos]; break;
      case 'L': pos = [args[0]!, args[1]!]; cur.push(pos); break;
      case 'H': pos = [args[0]!, pos[1]]; cur.push(pos); break;
      case 'V': pos = [pos[0], args[0]!]; cur.push(pos); break;
      case 'C': {
        const c1: Point = [args[0]!, args[1]!];
        const c2: Point = [args[2]!, args[3]!];
        const p1: Point = [args[4]!, args[5]!];
        controls.push(c1, c2);
        cur.push(...cubicPoints(pos, c1, c2, p1));
        pos = p1; ctrl = c2; break;
      }
      case 'S': {
        const c1: Point = lastCmd === 'C' || lastCmd === 'S' ? [2 * pos[0] - lastCtrl![0], 2 * pos[1] - lastCtrl![1]] : pos;
        const c2: Point = [args[0]!, args[1]!];
        const p1: Point = [args[2]!, args[3]!];
        controls.push(c1, c2);
        cur.push(...cubicPoints(pos, c1, c2, p1));
        pos = p1; ctrl = c2; break;
      }
      case 'Q': {
        const c: Point = [args[0]!, args[1]!];
        const p1: Point = [args[2]!, args[3]!];
        controls.push(c);
        cur.push(...quadPoints(pos, c, p1));
        pos = p1; ctrl = c; break;
      }
      case 'T': {
        const c: Point = lastCmd === 'Q' || lastCmd === 'T' ? [2 * pos[0] - lastCtrl![0], 2 * pos[1] - lastCtrl![1]] : pos;
        const p1: Point = [args[0]!, args[1]!];
        controls.push(c);
        cur.push(...quadPoints(pos, c, p1));
        pos = p1; ctrl = c; break;
      }
      case 'A': {
        const p1: Point = [args[5]!, args[6]!];
        cur.push(...arcPoints(pos, args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, p1));
        pos = p1; break;
      }
      case 'Z': close(); pos = start; cur = [pos]; break;
    }
    lastCtrl = ctrl;
    lastCmd = cmd;
  }
  close();
  return { subpaths, controls };
}

/** Axis-aligned bounds of the flattened path plus its curve control points. */
export function pathBounds(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const { subpaths, controls } = flattenPath(parsePath(d));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of [...subpaths.flat(), ...controls]) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Rasterises the path with the nonzero winding rule on a
 * `(ICON_BOX·SS)²` grid (sample at cell centres). Returns the grid as a flat
 * `Uint8Array` (1 = ink) and its side length.
 */
export function rasterize(d: string): { grid: Uint8Array; side: number } {
  const { subpaths } = flattenPath(parsePath(d));
  const side = ICON_BOX * SS;
  const grid = new Uint8Array(side * side);
  for (let gy = 0; gy < side; gy++) {
    const py = (gy + 0.5) / SS;
    for (let gx = 0; gx < side; gx++) {
      const px = (gx + 0.5) / SS;
      let winding = 0;
      for (const poly of subpaths) {
        for (let i = 0, n = poly.length; i < n; i++) {
          const a = poly[i]!;
          const b = poly[(i + 1) % n]!;
          if (a[1] <= py) {
            if (b[1] > py && (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]) > 0) winding++;
          } else if (b[1] <= py && (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]) < 0) winding--;
        }
      }
      if (winding !== 0) grid[gy * side + gx] = 1;
    }
  }
  return { grid, side };
}

/** Measurements of one icon's silhouette (docs/ICONS.md §4). */
export interface IconMetrics {
  /** Share of the 24 × 24 box that is inked. */
  coverage: number;
  /** Share of ink cells whose horizontal and vertical runs are both under `MIN_WEIGHT_PX`. */
  thinShare: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Measures coverage, thin share and bounds of a path. */
export function measureIcon(d: string): IconMetrics {
  const { grid, side } = rasterize(d);
  const minRun = MIN_WEIGHT_PX * SS;
  let ink = 0;
  let thin = 0;
  const hrun = new Int16Array(side * side);
  const vrun = new Int16Array(side * side);
  for (let y = 0; y < side; y++) {
    let run = 0;
    for (let x = 0; x < side; x++) {
      run = grid[y * side + x] ? run + 1 : 0;
      if (run) for (let k = x - run + 1; k <= x; k++) hrun[y * side + k] = run;
    }
  }
  for (let x = 0; x < side; x++) {
    let run = 0;
    for (let y = 0; y < side; y++) {
      run = grid[y * side + x] ? run + 1 : 0;
      if (run) for (let k = y - run + 1; k <= y; k++) vrun[k * side + x] = run;
    }
  }
  for (let i = 0; i < side * side; i++) {
    if (!grid[i]) continue;
    ink++;
    if (hrun[i]! < minRun && vrun[i]! < minRun) thin++;
  }
  return { coverage: ink / (side * side), thinShare: ink ? thin / ink : 0, bounds: pathBounds(d) };
}

/**
 * Validates one path against the §4 rules: allowed commands, bounds within
 * the box, minimum extent, centred, enough ink, and no hairline features.
 * Returns the list of problems (empty = valid).
 */
export function validateIconPath(d: string): string[] {
  const problems: string[] = [];
  let m: IconMetrics;
  try {
    m = measureIcon(d);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
  const { minX, minY, maxX, maxY } = m.bounds;
  if (minX < 0 || minY < 0 || maxX > ICON_BOX || maxY > ICON_BOX) {
    problems.push(`out of bounds: x ${minX.toFixed(2)}..${maxX.toFixed(2)} y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
  }
  if (maxX - minX < MIN_EXTENT || maxY - minY < MIN_EXTENT) problems.push(`extent under ${MIN_EXTENT} px`);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if (Math.abs(cx - ICON_BOX / 2) > MAX_CENTRE_OFFSET || Math.abs(cy - ICON_BOX / 2) > MAX_CENTRE_OFFSET) {
    problems.push(`off centre: (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  }
  if (m.coverage < MIN_COVERAGE) problems.push(`coverage ${(m.coverage * 100).toFixed(1)}% under ${MIN_COVERAGE * 100}%`);
  if (m.thinShare > MAX_THIN_SHARE) problems.push(`thin share ${(m.thinShare * 100).toFixed(1)}% over ${MAX_THIN_SHARE * 100}%`);
  return problems;
}
