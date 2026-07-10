---
"acture-hotkeys": patch
---

Fix keymap-capture and hotkey-fire correctness bugs (adversarial pre-wiring
review):

- **Spacebar is now bindable.** `tokenFromEvent` emitted `' '` for the space key,
  which tinykeys' space-separated chord parser strips to an empty, never-matching
  key — a captured Space shortcut silently never fired. It now emits `'Space'`
  (matched via `event.code`).
- **A throwing `when`-clause no longer crashes the key handler.** A function
  `when` that throws (e.g. reads a not-yet-populated context slice) previously
  killed the whole `keydown` handler and swallowed the remaining fallback
  candidates on that key; the fire loop now treats a throw as not-applicable and
  tries the next command (fail-closed, matching `registry.dispatch`).
- **Shadow-DOM inputs are respected.** `DEFAULT_IGNORE` now resolves the real
  target via `event.composedPath()[0]`, so typing in an `<input>` inside a web
  component's shadow DOM no longer triggers hotkeys.
- **No more phantom self-conflicts.** `resolveKeys` de-duplicates, so an `add`
  override (or preset) that restates a command's existing key no longer binds it
  twice or makes `detectConflicts` report the command as conflicting with itself.
- **The React `useHotkeys` hook no longer freezes stale callbacks.** `onDispatched`
  and `shouldIgnoreEvent` are routed through refs, so a fresh inline closure each
  render runs with current state instead of the values captured at first bind.
