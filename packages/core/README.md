# acture

> One schema. Palette, hotkeys, AI tools, MCP, and tests — for free.

Acture is a typed, schema-driven command dispatch library. Define an operation once; expose it as a command palette entry, keyboard shortcut, AI tool, MCP server tool, or test action.

This package is the **core**: registry, dispatcher, when-clause DSL, schema bridge, state-adapter types. Zero React, zero state-library dependencies. Concrete adapters live in `@acture/state-zustand`, `@acture/palette-react`, etc.

> **Phase 1 status.** `defineCommand` + `createRegistry` + `toJsonSchema` + when-clause DSL are stable. Parameterized-palette UX, hotkeys, MCP / AI adapters, and the migration package land in Phase 2 / 3.

## Install

```bash
pnpm add acture zod
```

`zod` is a peer dependency. The current bridge targets Zod v4.

## Quick start

```ts
import { z } from 'zod';
import { createRegistry, defineCommand, ok, err } from 'acture';

// 1. Define your commands.
const addNode = defineCommand({
  id: 'app.graph.addNode',               // app.domain.action namespace (required)
  title: 'Add node',                      // human label (required)
  description: 'Add a node to the graph.',// LLM-facing description; major change per semver
  category: 'Graph',                      // discovery aid; palettes group by this
  keybinding: '$mod+n',                   // tinykeys DSL; first-class field (research-1)
  params: z.object({                      // Zod schema; JSON-Schema-representable subset
    x: z.number(),
    y: z.number(),
    label: z.string().min(1),
  }),
  execute: (params, _ctx) => {
    // ... your business logic, e.g. mutate a state adapter ...
    return ok({ nodeId: 'n_42' });        // or `err('code', 'message', details?)`
  },
});

// 2. Create a registry and register commands.
const registry = createRegistry();
registry.register(addNode);

// 3. Dispatch from any surface. Validates params, evaluates `when`, runs `execute`.
const result = await registry.dispatch('app.graph.addNode', { x: 10, y: 10, label: 'A' });
if (result.ok) {
  console.log('created', result.value.nodeId);
} else {
  console.error(result.error.code, result.error.message);
}
```

## CommandRecord shape

The metadata surface is **closed** for v1 — new fields require three concrete callers. The fields below are exhaustive:

| Field           | Type                                          | Required | Notes |
| --------------- | --------------------------------------------- | -------- | ----- |
| `id`            | `string`                                      | yes      | Must match `app.domain.action` (lowercase camelCase segments). |
| `title`         | `string`                                      | yes      | Human label for palettes, menus, tooltips. |
| `description`   | `string`                                      | no       | LLM-facing too. Changes are MAJOR-by-default in `compare-schemas` (Phase 4). |
| `category`      | `string`                                      | no       | Discovery aid. Palettes group by this. |
| `icon`          | `string`                                      | no       | Discovery aid only. |
| `params`        | `ZodType<P>`                                  | no       | Standard Schema-compliant Zod. Restricted subset — see below. |
| `when`          | `string \| (ctx) => boolean`                  | no       | DSL string or function escape hatch. The function form is hidden from AI/MCP. |
| `keybinding`    | `string \| string[]`                          | no       | tinykeys DSL: `'$mod+K'`, `'g i'`, `'$mod+([0-9])'`. |
| `aliases`       | `string[]`                                    | no       | Search aliases for palette ranking. |
| `kind`          | `'atomic' \| 'handoff'`                       | no       | Phase 2 derives automatically from `params`; you may override. |
| `tier`          | `'stable' \| 'experimental' \| 'internal' \| 'deprecated'` | no | Default `'stable'`. Build step mirrors a JSDoc tag here in Phase 4. |
| `defaultScore`  | `number \| (ctx) => number`                   | no       | Palette ranking score. Functions reduce to `0` in Phase 1. |
| `follow`        | `string[]`                                    | no       | Suggested follow-up command IDs for palette hints. |
| `execute`       | `(params, ctx) => Result<R> \| Promise<Result<R>>` | yes | The handler. Throwing inside `execute` is fine — the dispatcher catches and converts to `err('execute_threw', …)`. |

### Param schema rules (JSON-Schema-representable subset)

`params` must round-trip through JSON Schema. Forbidden constructs (`defineCommand` throws `RegistrationError` at registration time):

- `z.transform`, `z.pipe` with transform — coercion belongs in the handler.
- `z.date` — use `z.string().datetime()` and parse inside `execute`.
- `z.bigint`, `z.nan` — not JSON-representable.
- `z.set`, `z.map` — JSON has no equivalent.
- `z.function`, `z.symbol`, `z.promise`, `z.void` — not serializable.
- `z.custom` — not statically convertible.

Everything else (`z.object`, `z.array`, `z.string`, `z.number`, `z.boolean`, `z.enum`, `z.literal`, `z.union`, `z.optional`, `z.nullable`, `z.record`, `z.tuple`, ...) is fine.

## Registry

```ts
const registry = createRegistry({
  defaultTier: 'stable',         // default tier for commands without one
  strictDuplicates: true,        // throw on duplicate id (default true)
});

const dispose = registry.register(cmd);      // returns dispose fn
const disposeAll = registry.registerAll([cmd1, cmd2]); // batched

registry.has(id);
registry.get(id);
registry.size();
registry.list();                              // tier-stable only by default
registry.list({ tiers: ['stable', 'experimental'] });
registry.list({ tiers: 'all' });              // excludes 'internal' unless explicitly named
registry.list({ context: { editor: { focused: true } } }); // also filters by when-clause

await registry.dispatch('app.x.y', params, ctx?);

registry.onCommandsChanged((event) => {
  // event.reason: 'register' | 'unregister' | 'registerAll' | 'disposeAll'
  // event.added, event.removed: string[] | undefined
});
```

`dispatch` returns a `Result<R>`:

```ts
type Result<R> =
  | { ok: true; value: R; patches?: Patch[]; effects?: Effect[] }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

`patches` and `effects` are **reserved hooks** for the post-v1 `@acture/undo` subsystem. Phase 1 ignores them on dispatch but preserves whatever your handler returns. Helpers: `ok(value, { patches?, effects? })` and `err(code, message, details?)`. Predicates: `isOk(r)`, `isErr(r)`.

### Built-in error codes

| Code                  | When |
| --------------------- | ---- |
| `unknown_command`     | `dispatch(id)` for an unregistered id. |
| `when_clause_failed`  | The command's `when` predicate returned false. |
| `invalid_params`      | Zod `safeParse` failed. `details.issues` is the ZodError. |
| `execute_threw`       | The handler threw. `details.stack` is the stack trace. |

## When-clause DSL

A small expression language compiled at registration time and evaluated at dispatch time.

| Construct                    | Example |
| ---------------------------- | ------- |
| Identifier (dotted path)     | `editor.focused`, `selection.length` |
| Boolean literals             | `true`, `false`, `null` |
| Number / string              | `42`, `"edit"`, `'edit'` |
| Negation                     | `!editor.focused` |
| Conjunction / disjunction    | `editor.focused && !view.readonly`<br>`a || b` |
| Equality                     | `mode == "edit"`, `count != 0` |
| Order                        | `selection.length >= 2`, `count <= 10` (no bare `>` / `<`) |
| Regex match                  | `path =~ /^src\//`, `path =~ "\\.ts$"` |
| Membership                   | `lang in langs`, `lang not in langs` |
| Grouping                     | `(a || b) && c` |

Function escape hatch: `when: (ctx) => ctx.editor?.focused === true`. Function-form `when` is flagged "not exposable to AI/MCP" — external projections (Phase 2 MCP / AI adapters) will hide such commands.

`evaluateWhen(when, ctx)` runs a clause; `compileWhen(source)` returns a reusable `CompiledWhen`.

## Schema bridge

```ts
import { toJsonSchema } from 'acture';

const envelope = toJsonSchema(cmd);
// {
//   name: 'app.graph.addNode',
//   description: 'Add a node to the graph.',
//   inputSchema: { type: 'object', properties: {...}, required: [...], additionalProperties: false }
// }
```

Options:

- `converter?: (schema) => Record<string, unknown>` — inject a non-Zod converter (Phase 2 Standard Schema work).
- `includeDescription?: boolean` — default `true`.
- `strict?: boolean` — OpenAI-style strict mode (`additionalProperties: false`, all `required`). Adds a `warnings: string[]` field flagging preserved constraints.

Commands with no `params` emit `{type: 'object', properties: {}, additionalProperties: false}`.

## State adapter interface

The core does not bundle a state library. It exports the type contract every adapter satisfies:

```ts
interface StateAdapter<S> {
  getState(): S;
  setState(updater: (state: S) => S | void): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

interface PatchCapableAdapter<S> extends StateAdapter<S> {
  readonly supportsPatches: true;
  setStateWithPatches(recipe: (draft: S) => void): {
    patches: readonly Patch[];
    inversePatches: readonly Patch[];
  };
  applyPatches(patches: readonly Patch[]): void;
}

function isPatchCapable<S>(a: StateAdapter<S>): a is PatchCapableAdapter<S>;
```

The Phase 1 reference adapter is [`@acture/state-zustand`](https://npm.im/@acture/state-zustand): `createZustandAdapter({ initialState })`.

## Writing a new command — pattern

Pick a stable namespaced `id`, give it a `title` and `description`, decide whether it has parameters, and write `execute`.

```ts
import { z } from 'zod';
import { defineCommand, ok, err } from 'acture';

const renameNode = defineCommand({
  id: 'app.graph.renameNode',
  title: 'Rename node',
  description: 'Change the label of a node.',
  category: 'Graph',
  params: z.object({
    nodeId: z.string(),
    label: z.string().min(1),
  }),
  execute: (params, _ctx) => {
    // Use your StateAdapter to mutate state.
    // myState.setStateWithPatches((draft) => { draft.nodes[params.nodeId].label = params.label; });
    return ok({ renamed: params.nodeId });
  },
});

registry.register(renameNode);
```

The example below shows registry composition with a host's state adapter — see [`@acture/example-graph-editor`](../../examples/greenfield/graph-editor) for the full worked example.

## Type exports

```ts
import type {
  CommandRecord,         // <P, R>
  AnyCommandRecord,
  Context,
  Result,
  CommandError,
  Patch,
  Effect,
  Tier,
  CommandKind,           // "atomic" | "handoff"
  ParamSchema,           // Zod authoring layer
  WhenClause,            // string | (ctx) => boolean
  DefaultScore,
  Registry,
  CreateRegistryOptions,
  ListOptions,
  CommandsChangedEvent,
  CommandsChangedListener,
  CommandsChangedReason,
  StateAdapter,
  PatchCapableAdapter,
  SelectableAdapter,
  ToJsonSchemaOptions,
  JsonSchemaEnvelope,
  CommandSpec,
  CompiledWhen,
} from 'acture';
```

## Hard don'ts

- Don't bypass `dispatch` — every mutation should flow through a registered command.
- Don't put conditional logic in metadata. If you want it, refactor or push into `execute`.
- Don't reflectively call handlers from LLM-provided strings — go through `dispatch`.
- Don't couple the registry to React. The registry is plain TypeScript.

## License

Apache-2.0.
