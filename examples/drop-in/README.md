# drop-in — acture Phase 2 worked example

Demonstrates the **drop-in / footprint-minimizer** positioning path: an existing app that already has its own state library and UI gets a palette + MCP server + hotkeys bolt-on in ~5 minutes.

```bash
pnpm install
pnpm --filter acture-example-drop-in dev
# open http://localhost:5174
```

## What the existing app looks like

A tiny todo list using `zustand/vanilla` with three actions: `addTodo`, `toggleTodo`, `removeTodo`. See [`src/existing-app.ts`](src/existing-app.ts) — this file represents the *before* state and is intentionally acture-agnostic.

## The 5-minute bolt-on

| File | Lines | What it does |
| --- | --- | --- |
| [`src/store.ts`](src/store.ts) | ~8 | Wraps the existing zustand store as an acture `PatchCapableAdapter`. The legacy store keeps its actions; the wrapper just adds the StateAdapter contract on top. |
| [`src/commands.ts`](src/commands.ts) | ~50 | Registers 5 commands. Each command's `execute` calls the existing action (`store.getState().addTodo(...)`) — no business logic is rewritten. |
| [`src/registry.ts`](src/registry.ts) | 2 | One-line registry construction. |
| [`src/App.tsx`](src/App.tsx) — palette overlay + `useHotkeys(registry)` | ~30 | New surface added; legacy `<TodoList>` and `<NewTodoForm>` untouched. |

Total new code: ~90 lines. Existing app components: zero changes.

## What you get

- **Ctrl/Cmd+K palette** searches and dispatches across all 5 todo commands.
- **⌘⇧1** toggles the first todo; **⌘⇧C** clears done — both via `acture-hotkeys` reading the same `keybinding` field the palette displays.
- **MCP server** (`pnpm --filter acture-example-drop-in mcp`) exposes the same commands as MCP tools, so Claude Desktop / mcp-inspector can drive the app.
- **Errors-as-data** at every surface: invalid params or unknown IDs return `{ ok: false, error: {...} }` instead of throwing.

## The wrap point

```ts
// src/store.ts
import { wrapZustandStore } from 'acture-state-zustand';
import { createExistingStore } from './existing-app.js';

export const store = createExistingStore();
export const actureState = wrapZustandStore(store);   // ← the seam
```

`wrapZustandStore` does NOT take ownership of the store — it just provides the StateAdapter contract for adapters that need it. The legacy UI continues to call `store.getState().toggleTodo(id)` as before; the acture commands call the same method through their `execute` handlers.

## Why this matters

The greenfield example ([`../greenfield/graph-editor`](../greenfield/graph-editor)) is what acture looks like in code you control from day one. **This** example is what acture looks like when you have a 3-year-old codebase and a 2-week budget. Both share the same registry, same StateAdapter, same MCP projection — that's the central claim of the architecture.

## When you'd graduate

Once the palette + MCP coverage feels right, you can start *moving* the action implementations into the command `execute` bodies and deleting the legacy actions. That's the strangler-fig path and is the subject of `acture-migration` (Phase 3).
