/**
 * `@acture/build-tier` — build-time tier mirror.
 *
 * Scans source for `@stable` / `@experimental` / `@internal` /
 * `@deprecated [reason]` JSDoc tags on `defineCommand` calls and mirrors
 * each tag into the runtime command's `tier` metadata field. For
 * `@internal`, also injects a module-scoped `Symbol('acture.internal')`
 * as the command's `internalToken` so `registry.dispatch` rejects
 * cross-module calls.
 *
 * Two integration points are exported in separate entry points so users
 * pay only for the bundler they use:
 *
 *   - `@acture/build-tier/esbuild` → an esbuild plugin (also works with
 *     tsup, which is esbuild under the hood).
 *   - `@acture/build-tier/vite` → a Vite plugin.
 *
 * The pure transform is exported here for users who want to wire it
 * into another bundler. See `acture-tier-system` skill §7.
 */

export {
  transformSource,
  parseTierDirective,
} from './transform.js';
export type {
  Tier,
  TierDirective,
  TransformResult,
} from './transform.js';
