# acture-undo

## 1.1.1

### Patch Changes

- 32bc464: Robustness fixes from the v1.13 audit:

  - **Runtime patch-capability guard.** `createUndoHistory(adapter, ...)` now throws an informative error when `adapter` is not a `PatchCapableAdapter` (instead of the cryptic `Cannot read properties of undefined (reading 'bind')` it would otherwise produce when the TS type was bypassed by a cast). Points the user at `acture-state-zustand` / `acture-state-redux` / any `PatchCapableAdapter<S>` implementation.
  - **onEffect errors are now logged.** Three previously-silent `catch {}` blocks around the host's `onEffect` handler (apply / undo / redo) now surface the thrown error via `console.warn` (defensively resolved via `globalThis.console?.warn`, same pattern as the registry's listener-error path). Behavior is otherwise unchanged: a throwing `onEffect` still does not break dispatch or undo. Makes host-side bugs visible instead of invisible.

  No public API change; both fixes only improve diagnostics on the unhappy path.

## 1.1.0

### Minor Changes

- a7b00bd: Initial release. Patch-based undo/redo over a `PatchCapableAdapter` (zustand-with-immer, RTK, MST). `createUndoHistory(adapter, registry, options?)` returns `{ undo, redo, canUndo, canRedo, clear, transaction, entries, dispose }`. Observes the adapter's `setStateWithPatches` calls and groups them by dispatch boundary — multiple patches per dispatch become ONE undo entry; multiple dispatches inside a `transaction(fn)` also become ONE entry. Partial-failure semantics: a throwing dispatch inside a transaction leaves prior mutations applied; the entry is still pushed; the caller can `undo()` to rewind (settled with the user). Effects flow through an optional `onEffect(effect, { isUndo, isRedo })` host callback at apply, undo, and redo lifecycle points — acture-undo never enacts effects itself. Inverse patches are pre-reversed at push time so `applyPatches(state, inversePatches)` is one call per undo. `limit` default 100; oldest dropped when exceeded. Hand-written equivalent: `docs/hand-written-undo.md`.
