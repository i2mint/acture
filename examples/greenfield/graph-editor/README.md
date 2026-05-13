# graph-editor — acture Phase 1 worked example

A tiny SVG graph editor whose every state mutation flows through `registry.dispatch`.

```bash
pnpm install
pnpm --filter @acture/example-graph-editor dev
# open http://localhost:5173
```

## What this demonstrates

- A `createZustandAdapter`-backed state store ([`src/state.ts`](src/state.ts)).
- 8 commands in [`src/commands/index.ts`](src/commands/index.ts):
  - **7 user-facing commands** matching `docs/implementation_plan.md` §"Phase 1":
    - `app.graph.addNode({x, y, label})` — parameterized; surfaces in palette with a "Phase 2" badge.
    - `app.graph.removeNode` — param-free; uses `when: "selection.length >= 1"`.
    - `app.graph.connectNodes` — param-free; uses `when: "selection.length == 2"`.
    - `app.graph.deleteEdge` — param-free; uses `when: "selection.length == 2"`.
    - `app.view.zoomToFit` — param-free.
    - `app.selection.selectAll` — param-free.
    - `app.view.toggleGrid` — param-free.
  - **1 internal helper command** (`app.selection.set({ids})`) — used by canvas clicks to update selection through the registry rather than via direct `setState`.
- A Ctrl+K palette overlay rendered by `<CommandPalette>` from `@acture/palette-react`.

## Phase 2 will add

- Picker UX for `app.graph.addNode` (the auto-derived `kind` for 3 numeric/text params is `handoff`, so a form view opens).
- Keyboard shortcut bindings from `keybinding` fields via `@acture/hotkeys`.
- Form view via `@acture/forms-autoform` (Zod) or `@acture/forms-rjsf` (JSON Schema).

## Audit

Phase 1 acceptance test #2: zero `setState` outside `execute` handlers.

```bash
rg "store\.setState|adapter\.setState|state\.setState" \
   packages/ examples/greenfield/graph-editor/src/ -t ts
# Should show only matches inside `execute: ...` blocks.
```
