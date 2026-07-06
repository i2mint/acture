---
"acture-hotkeys": minor
---

Add **end-user keymap customization** — let a *user* (not just the developer)
remap shortcuts and have the choice persist (research-10). Pure composition over
the record defaults: no change to the closed `CommandRecord`.

- **`bindHotkeys(registry, { keymap })`** — an optional `UserKeymap` (a sparse
  `commandId → { replace | add | remove }` override map) layered over each
  record's default `keybinding` at bind time. Default: an empty keymap, so
  existing callers are unaffected. `useHotkeys` (React) forwards it and re-binds
  on keymap identity change, so a live remap UI takes effect.
- **`resolveKeys(cmd, keymap)`** — the pure override resolution; `collectBindings`
  now accepts a keymap and orders user-touched bindings first on a shared key
  (VS Code's "user override wins, scope still respected").
- **`detectConflicts(registry, keymap?)`** — reports same-key clashes
  (`definite` when no sharer is `when`-scoped, else `possible`) — the
  highest-value remap affordance.
- **Capture / display primitives:** `tokenFromEvent` (press-to-record),
  `isReservedCombo` / `RESERVED_COMBOS` (reject browser-owned combos),
  `formatKeybinding` (⌘/Ctrl labels), `layoutLabel` (`getLayoutMap` for physical
  keys, with fallback).

The reproducible zero-dependency equivalent is `docs/hand-written-keymap-override.md`;
the full remap-UI React component stays the app's to build (the primitives cover it).
