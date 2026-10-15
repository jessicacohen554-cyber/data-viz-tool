/**
 * Rule R-PURE: lib/{core,data,format,palette,charts} are framework-free.
 * Rule from plan §12: no literal "/data/" URLs outside the dataset layer
 * (URLs are built from import.meta.env.BASE_URL).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PURE_DIRS = ['core', 'data', 'format', 'palette', 'charts'].map((d) => join(__dirname, '..', 'src', 'lib', d));
const FORBIDDEN = [/from\s+['"]svelte/, /\bdocument\./, /\bwindow\./, /from\s+['"]\$stores/, /from\s+['"]\.\.\/stores/, /from\s+['"]\.\.\/ui/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('framework-free boundary', () => {
  it('pure modules never import svelte, stores, ui or touch the DOM', () => {
    const offenders: string[] = [];
    for (const dir of PURE_DIRS) {
      let files: string[] = [];
      try { files = walk(dir); } catch { continue; }
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        for (const re of FORBIDDEN) if (re.test(src)) offenders.push(`${f}: ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no hard-coded absolute /data/ URLs in src/lib', () => {
    const offenders: string[] = [];
    for (const f of walk(join(__dirname, '..', 'src', 'lib'))) {
      const src = readFileSync(f, 'utf8');
      if (/['"`]\/data\//.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
