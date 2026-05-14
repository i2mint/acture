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

## Input-aware default

By default, `bindHotkeys` skips firing when the target is an `<input>`, `<textarea>`, `<select>`, or `contentEditable` element — so users typing in a search box don't accidentally trigger the `g` key. Override via `shouldIgnoreEvent`.

## Tier filter

Same shape as the rest of acture: `tiers: ['stable']` by default. Internal/experimental commands are not bound unless explicitly requested.

## See also

- [acture-command-record-shape](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-command-record-shape/SKILL.md) — the `keybinding` field spec
- [acture-architecture-primer](https://github.com/thorwhalen/acture/blob/main/.claude/skills/acture-architecture-primer/SKILL.md) — why every surface is an adapter
