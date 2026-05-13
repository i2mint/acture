# graph-editor — acture worked example

A tiny SVG graph editor whose every state mutation flows through `registry.dispatch`. Demonstrates the **greenfield** positioning path — acture owns the dispatch surface from day one.

```bash
pnpm install
pnpm --filter @acture/example-graph-editor dev
# open http://localhost:5173
```

## Surfaces wired up

| Surface | Adapter | What it does |
| --- | --- | --- |
| Ctrl/Cmd+K palette | `@acture/palette-react` + `@acture/forms-autoform` | List, atomic picker chain, handoff form |
| Keyboard shortcuts | `@acture/hotkeys` | Reads each command's `keybinding`, dispatches through the registry |
| MCP server (Node) | `@acture/mcp` | `pnpm mcp` exposes the graph as MCP tools |
| Vercel AI SDK | `@acture/ai-vercel` | `pnpm ai-demo` lets Claude compose multi-step actions |
| State substrate | `@acture/state-zustand` | zustand+immer with patch capture |

## Commands

8 commands in [`src/commands/index.ts`](src/commands/index.ts):

| ID | Params | Notes |
| --- | --- | --- |
| `app.graph.addNode` | `{ x, y, label }` | 3 free-text params → **handoff** (AutoForm) |
| `app.graph.removeNode` | – | `when: "selection.length >= 1"`, `keybinding: 'Delete'` |
| `app.graph.connectNodes` | – | `when: "selection.length == 2"` |
| `app.graph.deleteEdge` | – | `when: "selection.length == 2"` |
| `app.graph.renameNode` | `{ nodeId, label }` | handoff |
| `app.view.zoomToFit` | – | `keybinding: '$mod+0'` |
| `app.view.toggleGrid` | – | `keybinding: 'g'` |
| `app.selection.selectAll` | – | `keybinding: '$mod+a'` |
| `app.selection.set` | `{ ids }` | helper used by canvas clicks |
| `app.dev.resetState` | – | `tier: 'internal'` — test affordance only |

## How to add a command

Per `docs/phase-1-reflection.md` §4, this section walks the wiring so contributors don't have to read source first.

### 1. Know the state shape

The state lives in [`src/state.ts`](src/state.ts) and is JSON-serializable:

```ts
interface GraphState {
  nodes: Record<string, NodeRecord>;
  edges: Record<string, EdgeRecord>;
  selectedNodes: string[];
  view: ViewState;
  nextNodeNum: number;
  nextEdgeNum: number;
}
```

### 2. Use the factory pattern

Every command in `src/commands/index.ts` is defined inside a `buildCommands(state)` factory so it closes over the `StateAdapter`. That's how the registry receives commands with the state injected — there is **no module-level state singleton inside individual command files**.

### 3. Write the command

```ts
defineCommand({
  id: 'app.graph.renameNode',
  title: 'Rename node',
  params: z.object({ nodeId: z.string(), label: z.string().min(1) }),
  execute: (params) => {
    // noUncheckedIndexedAccess (per tsconfig.base) makes
    // `draft.nodes[id].label = ...` a TS error. Guard first:
    if (!state.getState().nodes[params.nodeId]) {
      return err('unknown_node', `No node with id ${params.nodeId}`);
    }
    state.setStateWithPatches((draft) => {
      const node = draft.nodes[params.nodeId];
      if (node) node.label = params.label;
    });
    return ok({ nodeId: params.nodeId, label: params.label });
  },
});
```

### 4. The `getState()` vs `setStateWithPatches` split

- **Read** with `state.getState()` — returns the latest immutable snapshot.
- **Mutate** with `state.setStateWithPatches(recipe)` — runs the recipe on an Immer draft and returns the patches for future `@acture/undo`. (`state.setState(updater)` works too, without the patch capture.)

The Phase 1 reflection (§4 #4) noted this wasn't called out — fixed here.

## MCP server demo

```bash
pnpm --filter @acture/example-graph-editor mcp
# in another shell:
npx @modelcontextprotocol/inspector node \
  examples/greenfield/graph-editor/scripts/mcp-server.ts
```

The graph state lives in the Node process that runs the MCP script — it does NOT share with the browser app. To wire the two together you'd put a real API layer in the middle.

## Vercel AI SDK demo

```bash
export ANTHROPIC_API_KEY=...
pnpm --filter @acture/example-graph-editor ai-demo
```

Claude composes a multi-step "build a triangle of A, B, C nodes" plan through the registry.

## Audit

Every state mutation goes through `registry.dispatch`. Phase 1 acceptance test #2:

```bash
rg "store\.setState|adapter\.setState|state\.setState" \
   packages/ examples/greenfield/graph-editor/src/ -t ts
# Should show only matches inside `execute: ...` blocks (commands directory).
```
