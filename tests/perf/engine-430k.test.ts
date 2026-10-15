/**
 * Performance gate for the data engine (docs/ARCHITECTURE.md §9, rule R-PERF).
 * Runs only with `PERF=1` (`npm run perf`) on the 430K-row ERCOT file and
 * prints the measured numbers; the budgets are desktop figures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QueryPlan } from '../../src/lib/core/types';
import { loadCsv } from '../../src/lib/data/csv-loader';
import { runQuery } from '../../src/lib/data/engine';

const FILE = join(__dirname, '../../data/datasets/ercot-system-hourly-2019-2025.csv');
const PARSE_BUDGET_MS = 2500;
const GROUPBY_BUDGET_MS = 40;

const plan3: QueryPlan = {
  datasetId: 'ercot-system-hourly-2019-2025',
  dims: [
    { key: 'z', field: 'zone' },
    { key: 'y', field: 'timestamp', date: { level: 'year', mode: 'part' } },
    { key: 'm', field: 'timestamp', date: { level: 'month', mode: 'part' } },
  ],
  measures: [
    { key: 'p', field: 'price_usd_mwh', aggregation: 'avg' },
    { key: 'd', field: 'demand_mw', aggregation: 'sum' },
    { key: 'x', field: 'price_usd_mwh', aggregation: 'max' },
  ],
  filters: [],
  disaggregate: false,
  limit: 50_000,
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

describe.skipIf(!process.env.PERF)('engine on the 430K-row ERCOT file', () => {
  it('parses + builds within budget and answers a 3-dim group-by within budget', async () => {
    const bytes = new Uint8Array(readFileSync(FILE));
    const t0 = performance.now();
    const { store, elapsedMs } = await loadCsv(bytes, { expectedRows: 429_240 });
    const parseMs = performance.now() - t0;
    expect(store.rowCount).toBe(429_240);
    expect(store.meta('timestamp').type).toBe('datetime');
    expect(store.meta('zone').cardinality).toBe(7);

    // Cold: derived date-part columns are computed on the first query and cached.
    const cold0 = performance.now();
    const first = runQuery(store, plan3);
    const coldMs = performance.now() - cold0;
    expect(first.groups).toBe(7 * 7 * 12);

    const warm: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      const r = runQuery(store, plan3);
      warm.push(performance.now() - t);
      expect(r.groups).toBe(first.groups);
    }
    const warmMs = median(warm);

    const t2 = performance.now();
    const median3 = runQuery(store, { ...plan3, measures: [{ key: 'med', field: 'price_usd_mwh', aggregation: 'median' }, { key: 'cd', field: 'demand_mw', aggregation: 'countd' }] });
    const medianMs = performance.now() - t2;
    expect(median3.groups).toBe(first.groups);

    const t3 = performance.now();
    const filtered = runQuery(store, { ...plan3, filters: [{ pillId: 'f', field: 'zone', kind: 'categorical', mode: 'include', values: ['Houston', 'North'], includeNull: false }] });
    const filteredMs = performance.now() - t3;
    expect(filtered.groups).toBe(2 * 7 * 12);

    const bytesMB = (bytes.byteLength / 1_048_576).toFixed(1);
    console.log(
      `\nPERF ercot-system-hourly-2019-2025 (${bytesMB} MB, ${store.rowCount} rows)\n` +
      `  parse+build         ${parseMs.toFixed(0)} ms (loader-reported ${elapsedMs.toFixed(0)} ms; budget ${PARSE_BUDGET_MS})\n` +
      `  3-dim group-by cold ${coldMs.toFixed(1)} ms (derived date parts computed)\n` +
      `  3-dim group-by warm ${warmMs.toFixed(1)} ms median of 7 (budget ${GROUPBY_BUDGET_MS}); runs: ${warm.map((w) => w.toFixed(1)).join(' ')}\n` +
      `  median+countd       ${medianMs.toFixed(1)} ms\n` +
      `  filtered group-by   ${filteredMs.toFixed(1)} ms (mask built cold)\n`,
    );
    expect(parseMs).toBeLessThanOrEqual(PARSE_BUDGET_MS);
    expect(warmMs).toBeLessThanOrEqual(GROUPBY_BUDGET_MS);
  }, 120_000);
});
