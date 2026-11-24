/**
 * `acture-undo` — patch-based undo/redo over a `PatchCapableAdapter`.
 *
 * Surface:
 *
 *     import { createUndoHistory } from 'acture-undo';
 *
 *     const history = createUndoHistory(stateAdapter, registry, {
 *       limit: 100,
 *       onEffect: (effect, { isUndo, isRedo }) => {
 *         if (isUndo) compensate(effect);
 *         else fireForward(effect);
 *       },
 *     });
 *
 *     await registry.dispatch('app.graph.addNode', { x, y, label });
 *     history.canUndo();   // → true
 *     history.undo();      // rolls back the node creation
 *     history.redo();      // re-applies it
 *
 *     await history.transaction(async () => {
 *       await registry.dispatch('app.foo');
 *       await registry.dispatch('app.bar');
 *     });
 *     // one undo entry covers both dispatches
 *
 *     history.dispose();   // restore the adapter + registry
 *
 * Requires a `PatchCapableAdapter<S>` (zustand-with-immer / RTK / MST).
 * Commands must use `adapter.setStateWithPatches` to mutate state — bare
 * `adapter.setState` calls are invisible to undo.
 *
 * The hand-written equivalent — what an agent would write into the
 * target project instead of installing this package — is
 * `docs/hand-written-undo.md`.
 */

export { createUndoHistory } from './undo.js';
export type {
  UndoEntryResult,
  CreateUndoHistoryOptions,
  UndoEffectContext,
  UndoEffectHandler,
  UndoEntry,
  UndoHistory,
} from './undo.js';
