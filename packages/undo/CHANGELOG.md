# acture-undo

## 1.2.1

### Patch Changes

- 43a11df: `history.transaction(fn, { join: true })`, called from inside a dispatch (a command's `execute`, as `acture/selection`'s commands do), joins that dispatch's capture instead of throwing "nested transactions are not supported": the dispatch is one undo entry, and the transaction resolves to it (`isApplied` true and `undoEntry` `busy` until the dispatch closes; `null` if the capture closed before the callback finished). Without `join` it still throws. When an unrelated command overlapped it (overlapping dispatches share one capture), `undoEntry` refuses the joined handle with the new reason `'shared'` rather than undo that command too. The README's `acture/selection` wiring passes the seam's `inDispatch` as `join`, and maps `undoEntry`'s `busy` to `false` (a failed Undo, tried again) instead of a permanent conflict.

## 1.2.0

### Minor Changes

- f993836: `transaction(fn)` resolves to the entry it pushed (`null` when it captured nothing), and `undoEntry(entry)` undoes exactly that entry, only while it is the last one applied (`{ ok: false, reason: 'not-on-top' | 'already-undone' | 'unknown' }` otherwise); `isApplied(entry)` says whether it is. An undo toast bound to its own action no longer undoes a later edit. This is what `acture/selection`'s `transactionUndo(entry)` seam needs.

## 1.1.1

### Patch Changes

- 32bc464: Robustness fixes from the v1.13 audit:

  - **Runtime patch-capability guard.** `createUndoHistory(adapter, ...)` now throws an informative error when `adapter` is not a `PatchCapableAdapter` (instead of the cryptic `Cannot read properties of undefined (reading 'bind')` it would otherwise produce when the TS type was bypassed by a cast). Points the user at `acture-state-zustand` / `acture-state-redux` / any `PatchCapableAdapter<S>` implementation.
  - **onEffect errors are now logged.** Three previously-silent `catch {}` blocks around the host's `onEffect` handler (apply / undo / redo) now surface the thrown error via `console.warn` (defensively resolved via `globalThis.console?.warn`, same pattern as the registry's listener-error path). Behavior is otherwise unchanged: a throwing `onEffect` still does not break dispatch or undo. Makes host-side bugs visible instead of invisible.

  No public API change; both fixes only improve diagnostics on the unhappy path.

## 1.1.0

### Minor Changes

- a7b00bd: Initial release. Patch-based undo/redo over a `PatchCapableAdapter` (zustand-with-immer, RTK, MST). `createUndoHistory(adapter, registry, options?)` returns `{ undo, redo, canUndo, canRedo, clear, transaction, entries, dispose }`. Observes the adapter's `setStateWithPatches` calls and groups them by dispatch boundary — multiple patches per dispatch become ONE undo entry; multiple dispatches inside a `transaction(fn)` also become ONE entry. Partial-failure semantics: a throwing dispatch inside a transaction leaves prior mutations applied; the entry is still pushed; the caller can `undo()` to rewind (settled with the user). Effects flow through an optional `onEffect(effect, { isUndo, isRedo })` host callback at apply, undo, and redo lifecycle points — acture-undo never enacts effects itself. Inverse patches are pre-reversed at push time so `applyPatches(state, inversePatches)` is one call per undo. `limit` default 100; oldest dropped when exceeded. Hand-written equivalent: `docs/hand-written-undo.md`.
