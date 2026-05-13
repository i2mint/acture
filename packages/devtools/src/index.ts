/**
 * `@acture/devtools` — embeddable inspector for acture registries.
 *
 * Two pieces:
 *
 *   - `instrumentRegistry(registry)` — wrap `dispatch` to capture a
 *     ring-buffered dispatch log (production builds skip the call and
 *     pay zero runtime cost).
 *   - `<Inspector registry={...} log={...} />` — React component that
 *     renders the commands, the dispatch log, and a when-clause
 *     evaluator. Pure-React; no UI-kit dep.
 *
 * The package is designed to live behind a `if (import.meta.env.DEV)`
 * guard in the host app — production bundles tree-shake to nothing.
 */

export { Inspector } from './inspector.js';
export type { InspectorProps } from './inspector.js';

export { instrumentRegistry } from './dispatch-log.js';
export type { DispatchLog, DispatchLogEntry } from './dispatch-log.js';
