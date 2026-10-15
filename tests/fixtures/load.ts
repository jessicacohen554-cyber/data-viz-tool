/**
 * Test helpers for the data engine: load a fixture CSV (or an in-memory table)
 * into a `ColumnStore` through the real loader. Test-only; not shipped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCsv, type LoadCsvOptions, type LoadCsvResult } from '../../src/lib/data/csv-loader';

/** Bytes of a file under `tests/fixtures/`. */
export function fixtureBytes(name: string): Uint8Array<ArrayBuffer> {
  const buf = readFileSync(join(__dirname, name));
  const out = new Uint8Array(new ArrayBuffer(buf.byteLength));
  out.set(buf);
  return out;
}

/** Load `tests/fixtures/<name>` through `loadCsv`. */
export function loadFixture(name: string, opts: LoadCsvOptions = {}): Promise<LoadCsvResult> {
  return loadCsv(fixtureBytes(name), opts);
}

/** Serialize a header and rows to CSV text (cells quoted when needed). */
export function csvOf(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

/** Load an in-memory table through `loadCsv`. */
export function loadTable(header: readonly string[], rows: readonly (readonly string[])[], opts: LoadCsvOptions = {}): Promise<LoadCsvResult> {
  return loadCsv(new TextEncoder().encode(csvOf(header, rows)), opts);
}

/** Deterministic PRNG (mulberry32) for synthetic fixtures. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
