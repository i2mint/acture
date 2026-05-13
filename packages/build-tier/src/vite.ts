/**
 * Vite plugin. Mirrors the esbuild plugin for `vite` consumers (the
 * greenfield example uses Vite).
 *
 * Usage in vite.config.ts:
 *
 *   import { actureBuildTierVite } from '@acture/build-tier/vite';
 *   export default defineConfig({
 *     plugins: [actureBuildTierVite()],
 *   });
 *
 * Vite runs `transform` hooks for every loaded module; we filter to
 * `.ts` / `.tsx` under the consumer's source tree and skip
 * `node_modules`.
 */

import { transformSource } from './transform.js';

/** Minimal Vite plugin shape. Avoids pulling in vite as a dep. */
export interface VitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  transform?(code: string, id: string): { code: string; map: null } | undefined;
}

export interface ActureBuildTierViteOptions {
  /** File-path regex. Defaults to `/\\.tsx?$/`. */
  filter?: RegExp;
  /** Skip transform for paths matching this regex. Defaults to a
   *  `node_modules` matcher. */
  exclude?: RegExp;
}

/** Vite plugin wrapper. Marked `enforce: 'pre'` so the transform runs
 *  before Vite's own TypeScript transform — the JSDoc must still be in
 *  the source when we scan. */
export function actureBuildTierVite(
  options: ActureBuildTierViteOptions = {},
): VitePlugin {
  const filter = options.filter ?? /\.tsx?$/;
  const exclude = options.exclude ?? /node_modules/;
  return {
    name: 'acture-build-tier',
    enforce: 'pre',
    transform(code, id) {
      if (!filter.test(id)) return undefined;
      if (exclude.test(id)) return undefined;
      const result = transformSource(code);
      if (!result.changed) return undefined;
      return { code: result.code, map: null };
    },
  };
}
