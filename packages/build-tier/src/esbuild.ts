/**
 * esbuild plugin. Also works with tsup, which is esbuild under the hood.
 *
 * Usage in a consumer's tsup.config.ts:
 *
 *   import { actureBuildTier } from 'acture-build-tier/esbuild';
 *   export default defineConfig({
 *     entry: ['src/index.ts'],
 *     esbuildPlugins: [actureBuildTier()],
 *   });
 *
 * The plugin matches `.ts` and `.tsx` files inside the consumer's
 * project (it deliberately does NOT touch `node_modules/`).
 */

import { readFile } from 'node:fs/promises';
import { transformSource } from './transform.js';

/** Minimal subset of the esbuild Plugin shape we depend on, to avoid
 *  pulling esbuild's types into our public surface. */
export interface ESBuildPlugin {
  name: string;
  setup(build: {
    onLoad(
      options: { filter: RegExp; namespace?: string },
      callback: (args: { path: string }) => Promise<
        | { contents: string; loader: 'ts' | 'tsx'; }
        | undefined
      > | { contents: string; loader: 'ts' | 'tsx'; } | undefined,
    ): void;
  }): void;
}

export interface ActureBuildTierOptions {
  /** File-path regex. Defaults to `/\\.tsx?$/`. */
  filter?: RegExp;
  /** Skip transform for paths matching this regex. Defaults to a
   *  `node_modules` matcher. */
  exclude?: RegExp;
}

/** esbuild / tsup plugin. */
export function actureBuildTier(options: ActureBuildTierOptions = {}): ESBuildPlugin {
  const filter = options.filter ?? /\.tsx?$/;
  const exclude = options.exclude ?? /node_modules/;
  return {
    name: 'acture-build-tier',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        if (exclude.test(args.path)) return undefined;
        const buf = await readFile(args.path, 'utf8');
        const { code, changed } = transformSource(buf);
        if (!changed) return undefined;
        const loader: 'ts' | 'tsx' = args.path.endsWith('.tsx') ? 'tsx' : 'ts';
        return { contents: code, loader };
      });
    },
  };
}
