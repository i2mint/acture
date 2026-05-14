/**
 * `acture-cli` programmatic API.
 *
 * Exports the building blocks of the CLI so consumers can:
 *
 *   - call `snapshotRegistry(registry)` to produce a JSON snapshot from
 *     a live registry (typically once per build / git tag),
 *   - feed two snapshots to `classifyChanges(base, head, options)` to
 *     get the same diff the `compare-schemas` subcommand produces,
 *   - format the result via `formatResult(result, 'text' | 'json')`.
 *
 * The `acture` binary lives at `./dist/cli.js`; this entry point does
 * NOT call into the CLI parser.
 */

export {
  snapshotRegistry,
  commandToSnapshotTool,
  parseSnapshot,
} from './snapshot.js';
export type { Snapshot, SnapshotTool } from './snapshot.js';

export {
  classifyChanges,
} from './classify.js';
export type {
  Severity,
  Change,
  ChangeKind,
  ClassifyOptions,
  ClassifyResult,
} from './classify.js';

export { formatResult } from './format.js';
export type { OutputFormat, FormatOptions } from './format.js';

export { loadSnapshot } from './load.js';
export type { LoadOptions } from './load.js';

export { runSnapshotCmd } from './snapshot-cmd.js';
export type { SnapshotCmdArgs } from './snapshot-cmd.js';
