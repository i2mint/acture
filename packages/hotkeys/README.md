# acture-hotkeys

> **acture is a development tool first.** This package is an *optional accelerator* — an agent can hand-write this integration into your project instead, with no `acture-*` dependency. Installing it is a deliberate, opt-in choice to reuse tested code rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

Keyboard-shortcut adapter for [acture](https://npm.im/acture). Reads `keybinding` off every CommandRecord and dispatches through the registry on key match. Built on [tinykeys](https://github.com/jamiebuilds/tinykeys).

## Why an adapter at all?

Same reason acture has a palette adapter and a state adapter: keyboard shortcuts are a **consumer surface** of the command registry, not a separate concern of every command. One `keybinding` field on the record, every external surface (palette, hotkeys, AI tool use, MCP) reads it.

## Install

```sh
pnpm add acture-hotkeys tinykeys
```

## Plain DOM API

```ts
import { bindHotkeys } from 'acture-hotkeys';

const stop = bindHotkeys(registry, {
  contextProvider: () => ({ selection: getSelection() }),
  onDispatched: (cmd, result) => console.log(cmd.id, result),
});

// later:
stop();
```

`bindHotkeys` rebinds automatically on `commandsChanged`, so a newly registered command with a `keybinding` becomes reachable without restart.

## React API

```tsx
import { useHotkeys } from 'acture-hotkeys/react';

function App() {
  const selection = useSelection();
  useHotkeys(registry, {
    context: { selection },
    onDispatched: (cmd, result) => toast(`${cmd.title}: ${result.ok ? 'ok' : 'failed'}`),
  });
  return <Canvas />;
}
```

The `context` value is captured via a ref, so fast-changing values (selection, focus) don't churn the bindings.

## Conflict resolution: first-registered-wins

When two commands share a key sequence, the first registered command whose `when` clause passes the current context wins. This matches Obsidian / Raycast / Linear conventions (research-1) and gives authors deterministic muscle-memory.

```ts
registry.register(commandA); // keybinding: 'g', when: 'editor.focused'
registry.register(commandB); // keybinding: 'g', when: '!editor.focused'
// Pressing 'g' inside the editor fires A; outside fires B.
```

If you want to *override* a base binding from a plugin, explicitly `unregister(id)` the base command first.

## End-user customization — remapping shortcuts

Let a **user** (not just the developer) remap shortcuts and have the choice persist. The record's `keybinding` stays the *developer default*; a sparse **`UserKeymap`** overrides it at bind time — pure composition, **no change to the `CommandRecord`** ([research-10](https://github.com/thorwhalen/acture/blob/main/docs/research/acture_research_10%20--%20End-User%20Keyboard-Shortcut%20Customization.md); reproducible core in [`docs/hand-written-keymap-override.md`](https://github.com/thorwhalen/acture/blob/main/docs/hand-written-keymap-override.md)).

```ts
import { bindHotkeys, type UserKeymap } from 'acture-hotkeys';

const keymap: UserKeymap = {
  version: 1,
  overrides: {
    'editor.save':   { kind: 'replace', keys: ['$mod+s'] }, // rebind
    'editor.format': { kind: 'add',     keys: ['$mod+Shift+f'] }, // add a second binding
    'app.help':      { kind: 'remove' }, // unbind
  },
};

const stop = bindHotkeys(registry, { keymap });   // omit → record defaults, unchanged
```

`useHotkeys` forwards `keymap` and re-binds on its identity change, so a live settings UI takes effect. Persist the `UserKeymap` as JSON (localStorage / a server row); `$mod` keeps tokens portable across a user's machines.

Build the remap UI from the exported primitives:

- **`detectConflicts(registry, keymap?)`** → same-key clashes (`definite` / `possible`), for the "Already assigned to X — Reassign / Keep both / Cancel" flow.
- **`tokenFromEvent(event)`** → a tinykeys token from a `keydown` (press-to-record); **`isReservedCombo(token)`** rejects browser-owned combos (`$mod+w`, `$mod+t`, …) that `preventDefault` can't reclaim.
- **`formatKeybinding(token)`** → a ⌘/Ctrl label; **`layoutLabel(code)`** → a layout-correct label for physical (`event.code`) bindings via `navigator.keyboard.getLayoutMap()` (with fallback).
- **`resolveKeys(cmd, keymap)`** / **`collectBindings(registry, tiers, keymap)`** → the resolution, if you build a custom binder.

> **WCAG 2.1.4 (Level A):** if you ship single-key bindings (`"g i"`, `"d"`), also ship a "disable character-key shortcuts" toggle or default them off/focus-scoped — a legal requirement, not a nicety.

## Input-aware default

By default, `bindHotkeys` skips firing when the target is an `<input>`, `<textarea>`, `<select>`, or `contentEditable` element — so users typing in a search box don't accidentally trigger the `g` key. Override via `shouldIgnoreEvent`.

## Tier filter

Same shape as the rest of acture: `tiers: ['stable']` by default. Internal/experimental commands are not bound unless explicitly requested.

## See also

- [acture-command-record-shape](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-command-record-shape/SKILL.md) — the `keybinding` field spec
- [acture-architecture-primer](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-architecture-primer/SKILL.md) — why every surface is an adapter
