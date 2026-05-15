---
'acture-undo': patch
---

Robustness fixes from the v1.13 audit:

- **Runtime patch-capability guard.** `createUndoHistory(adapter, ...)` now throws an informative error when `adapter` is not a `PatchCapableAdapter` (instead of the cryptic `Cannot read properties of undefined (reading 'bind')` it would otherwise produce when the TS type was bypassed by a cast). Points the user at `acture-state-zustand` / `acture-state-redux` / any `PatchCapableAdapter<S>` implementation.
- **onEffect errors are now logged.** Three previously-silent `catch {}` blocks around the host's `onEffect` handler (apply / undo / redo) now surface the thrown error via `console.warn` (defensively resolved via `globalThis.console?.warn`, same pattern as the registry's listener-error path). Behavior is otherwise unchanged: a throwing `onEffect` still does not break dispatch or undo. Makes host-side bugs visible instead of invisible.

No public API change; both fixes only improve diagnostics on the unhappy path.
