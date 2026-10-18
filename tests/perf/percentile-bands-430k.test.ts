/**
 * Performance gate for v2 percentile bands (shard T1; docs/ARCHITECTURE.md §9,
 * rule R-PERF). Runs only with `PERF=1` (`npm run perf`) on the 430K-row ERCOT
 * file: 24 groups (HOUR of timestamp) × 5 band levels must answer in ≤ 150 ms
 * on desktop. Prints the measured numbers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QueryPlan } from '../../src/lib/core/types';
import { loadCsv } from '../../src/lib/data/csv-loader';
import { runQuery } from '../../src/lib/data/engine';

const FILE = join(__dirname, '../../data/datasets/ercot-system-hourly-2019-2025.csv');
const BANDS_BUDGET_MS = 150;
const LEVELS = [5, 25, 50, 75, 95];

const base: QueryPlan = {
  datasetId: 'ercot-system-hourly-2019-2025',
  dims: [{ key: 'h', field: 'timestamp', date: { level: 'hour', mode: 'part' } }],
  measures: [{ key: 'p', field: 'price_usd_mwh', aggregation: 'avg' }],
  filters: [],
  disaggregate: false,
  limit: 50_000,
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

describe.skipIf(!process.env.PERF)('percentile bands on the 430K-row ERCOT file', () => {
  it('24 groups × 5 levels within budget', async () => {
    const bytes = new Uint8Array(readFileSync(FILE));
    const { store } = await loadCsv(bytes, { expectedRows: 429_240 });
    expect(store.rowCount).toBe(429_240);

    // Warm the derived HOUR column so the timing isolates bucketing + percentiles.
    expect(runQuery(store, base).groups).toBe(24);

    const plan: QueryPlan = { ...base, bands: { measureKey: 'p', levels: LEVELS } };
    const runs: number[] = [];
    let first: ReturnType<typeof runQuery> | null = null;
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      const r = runQuery(store, plan);
      runs.push(performance.now() - t);
      first ??= r;
    }
    const bandsMs = median(runs);
    expect(first!.groups).toBe(24);
    expect(first!.bands).toHaveLength(LEVELS.length);
    for (const b of first!.bands!) { expect(b).toHaveLength(24); expect(Array.from(b).every((v) => v === v)).toBe(true); }
    // Levels are monotone per group.
    for (let g = 0; g < 24; g++) for (let k = 1; k < LEVELS.length; k++) expect(first!.bands![k]![g]!).toBeGreaterThanOrEqual(first!.bands![k - 1]![g]!);

    // Six percentile aggregations on one field share a single bucketing pass.
    const t2 = performance.now();
    const six = runQuery(store, { ...base, measures: ['p05', 'p10', 'p25', 'p75', 'p90', 'p95'].map((a) => ({ key: a, field: 'price_usd_mwh', aggregation: a as QueryPlan['measures'][number]['aggregation'] })) });
    const sixMs = performance.now() - t2;
    expect(six.groups).toBe(24);

    process.stdout.write(
      `\nPERF percentile bands (${store.rowCount} rows, 24 groups)\n` +
      `  bands ×5 levels     ${bandsMs.toFixed(1)} ms median of 5 (budget ${BANDS_BUDGET_MS}); runs: ${runs.map((w) => w.toFixed(1)).join(' ')}\n` +
      `  six P-aggregations  ${sixMs.toFixed(1)} ms (one shared bucketing)\n`,
    );
    expect(bandsMs).toBeLessThanOrEqual(BANDS_BUDGET_MS);
  }, 120_000);
});
