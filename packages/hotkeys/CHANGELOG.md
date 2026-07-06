# acture-hotkeys

## 1.1.0

### Minor Changes

- cfe98d3: Add **end-user keymap customization** — let a _user_ (not just the developer)
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

## 1.0.1

### Patch Changes

- 5dc511e: Republish to fix the published peer dependency on `acture`.

  The npm-published `1.0.0` of these three consumer packages pins `acture` to
  `1.1.0` **exactly** in `peerDependencies`, so `npm install` fails (ERESOLVE)
  in any app that also has a newer `acture` (e.g. `acture@1.3.0`):

  ```
  peer acture@"1.1.0" from acture-palette-react@1.0.0
  ```

  The source on `main` already declares the correct `^1.0.0` range — it was
  simply never republished after that fix. This patch bump republishes the three
  packages so npm serves the corrected `^1.0.0` peer, and consumers can install
  them alongside any `acture@^1.x` without `--legacy-peer-deps`.

  (`acture-forms-autoform` was already republished with the correct range at
  `1.0.1`, so it is not included here.)
