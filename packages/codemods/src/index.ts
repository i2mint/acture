/**
 * `@acture/codemods` — codemod tooling for the strangler-fig adoption
 * path. Single `npx @acture/codemods <name>` CLI with a manifest of
 * shipped transforms. Research-4 §B.5.
 *
 * Programmatic API is also exported here for hosts that want to invoke
 * a codemod from their own tooling without spawning a child process.
 *
 * ```ts
 * import { runCodemod } from '@acture/codemods';
 *
 * const result = await runCodemod('wrap-handler-with-mutation', {
 *   files: ['src/Button.tsx'],
 *   dryRun: true,
 * });
 * ```
 */

export { MANIFEST, findCodemod, listShipped } from './manifest.js';
export type { ManifestEntry } from './manifest.js';
export { runCodemod } from './runner.js';
export type {
  Codemod,
  CodemodOptions,
  CodemodResult,
  FileChange,
} from './types.js';

export { wrapHandlerWithMutation } from './codemods/wrap-handler-with-mutation.js';
export { extractOnClickToCommand } from './codemods/extract-onclick-to-command.js';
