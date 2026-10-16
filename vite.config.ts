/**
 * Vite configuration.
 *
 * `base: './'` makes every asset URL relative, so one `dist/` serves from the
 * local launcher (http://127.0.0.1:8766/) and from GitHub Pages
 * (https://<user>.github.io/data-viz-tool/) without a rebuild. Asset names are
 * deterministic (no content hash) so the committed `dist/` diff stays small.
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/** The `$core`, `$stores`, … path aliases of tsconfig.json, so Vitest resolves them too (S4 seam 1). */
const lib = (dir: string) => fileURLToPath(new URL(`./src/lib/${dir}`, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    alias: {
      $core: lib('core'),
      $data: lib('data'),
      $format: lib('format'),
      $palette: lib('palette'),
      $charts: lib('charts'),
      $stores: lib('stores'),
      $ui: lib('ui'),
    },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: process.env.PERF ? [] : ['tests/perf/**'],
  },
});
