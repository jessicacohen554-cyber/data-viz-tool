import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Svelte 5 (runes) with TypeScript preprocessing. */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true },
};
