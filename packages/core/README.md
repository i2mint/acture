# acture

> **acture is a development tool first.** Even this core package is optional — an agent can write a registry + dispatcher directly into your project following acture's patterns. Installing `acture` is a deliberate choice to reuse the primitive rather than own it. See [`docs/positioning.md`](../../docs/positioning.md).

> One schema. Palette, hotkeys, AI tools, MCP, and tests — for free.

Acture is a typed, schema-driven command dispatch library. Define an operation once; expose it as a command palette entry, keyboard shortcut, AI tool, MCP server tool, or test action.

This package is the **core**: registry, dispatcher, when-clause DSL, schema bridge, state-adapter types. Zero React, zero state-library dependencies. Concrete adapters live in `acture-state-zustand`, `acture-palette-react`, etc.

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

The metadata surface is **closed** for v1 — adding a field is a deliberate scope decision, not a casual addition (see `docs/redesign_takeaways.md` §3 / hard-don't #1, inner platform effect). The fields below are exhaustive:

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

`patches` and `effects` are **reserved hooks** for the post-v1 `acture-undo` subsystem. Phase 1 ignores them on dispatch but preserves whatever your handler returns. Helpers: `ok(value, { patches?, effects? })` and `err(code, message, details?)`. Predicates: `isOk(r)`, `isErr(r)`.

### Built-in error codes

| Code                  | When |
| --------------------- | ---- |
| `unknown_command`     | `dispatch(id)` for an unregistered id. |
| `when_clause_failed`  | The command's `when` predicate returned false. |
| `invalid_params`      | Zod `safeParse` failed. `details.issues` is the ZodError. |
| `execute_threw`       | The handler threw. `details.stack` is the stack trace. |

### `acture/lite`: the registry on a byte budget

A page with a hard per-page byte budget can import the same registry from `acture/lite`: about 2.9 kB minified (1.4 kB gzip) for `createRegistry, defineCommand, ok, err`, against about 12 kB from `acture`. Same `Registry` interface, same `CommandRecord` shape, same error codes; records register unchanged in either, so upgrading is swapping the import.

```ts
import { createRegistry, defineCommand, ok } from 'acture/lite';

const registry = createRegistry();
registry.register(defineCommand({
  id: 'app.view.toggleGrid',
  title: 'Toggle grid',
  when: (ctx) => ctx.canvas === true,   // functions only
  execute: () => ok(toggleGrid()),
}));
```

It leaves out the two things that make up most of the full entry's size:

- **The when-clause DSL.** `when` must be a function; a DSL string is refused at `register` with a `RegistrationError`. To accept strings, inject acture's evaluator: `createRegistry({ evaluateWhen })` with `evaluateWhen` from `acture` (it brings the DSL's bytes back). Keep to acture's DSL: the full registry and the adapters read string clauses that way.
- **`defineCommand`'s checks.** Lite's `defineCommand` only freezes the spec. Run the full entry's `validateCommand(record)` over the same records in a test or a dev build to keep the checks out of the shipped bytes.

`acture/lite` loads no Zod at runtime: `dispatch` calls the `params` object's own `safeParse`, so a hand-written `{ safeParse }` guard works. `params` is typed structurally (anything with a `safeParse` returning `{ success, data }` or `{ success, error: { issues } }`), so a hand-written guard type-checks with no cast and no Zod types. The schema bridge (`toJsonSchema`) and the full entry's `defineCommand` checks need a Zod schema. The full entry imports Zod at runtime. Budgets per entry live in `size-budget.json` and are checked in CI by `pnpm --filter acture size`; the lite budget also fails if its bundle keeps any import (Zod included).

### `acture/selection`: bulk actions on a selection

A **selection action** (bulk action) applies one action to a selection: explicit ids, or a query with exceptions ("all 340 matching, except these 3"). `acture/selection` gives it a per-item gate whose refusals show before the click, one Undo for the whole operation (compare-and-set per item: an item changed since is reported as a conflict, not overwritten; still offered for the part done when some items fail, with `retry()` for the rest), and the rule for asking first: a bulk action confirms, with the count, unless one Undo takes it all back in place; it always confirms when a query now matches a different number than the person saw (or that cannot be counted), or, given `shown`, when some targets are not shown.

```ts
import { createSelectionCommands, liftToSelection, sameSelection } from 'acture/selection';
import { offerUndo } from 'undo-toast';

const moveToTrash = liftToSelection<Song>({
  id: 'library.selection.moveToTrash',
  title: 'Move the selection to the Trash',
  reversal: 'compensating',                          // one Undo restores all: act, then offer Undo
  verb: (n) => `Move ${n} songs to Trash`,
  done: (n) => `${n} songs moved to Trash`,
  appliesTo: (s) => s.owner === me || 'not yours',   // refusals are counted before anything runs
  runItem: async (s) => {
    const { version } = await api.trash(s.id);
    // compare-and-set: restore only if it is still as this action left it
    return async () => ((await api.restore(s.id, { ifVersion: version })).ok ? undefined : 'conflict');
  },
});

for (const c of createSelectionCommands([moveToTrash], {
  current: () => selectionStore.getState().selection,
  resolve: (sel) => resolveSelection(rows(), sel),
  shown: () => shownIds(),                            // targets not shown make it ask first
  offer: ({ message, undo, count, reversal }) => offerUndo({ message, undo: () => undo().then(() => {}), context: { reversal, count } }),
  afterRun: (_, chosen) => { if (sameSelection(selectionStore.getState().selection, chosen)) selectionStore.getState().clear(); },
})) registry.register(c);
```

A command that needs a yes returns `err('needs_confirmation', question, { token, count, confirmLabel, typeToConfirm, hidden })`; calling again with `confirmed: <token>` runs it only if the plan is unchanged (a selection that grew since asks again), so an AI must show the person the question and cannot pre-confirm. With a `confirm` seam (a dialog), the command asks the person itself. A query passed as a parameter without `expectedCount` always asks. Other codes: `empty_selection`, `nothing_applies`, `declined`, `busy` (`SELECTION_ERRORS`).

`planSelection(action, params, selection, seams)` is the same logic for a button: it returns the targets, the refusals, the weakest `reversal` over the targets (`reversalOf(item)` marks an item Undo cannot take back), and the confirmation; `go()` runs it. The seams are one argument each: `resolve`, `key`, `shown`, `policy` (receives the action id, reversal, count, verb, `undoAvailable`, hidden and the action's `policyContext`, so undo-toast's `advise` with a preset plugs in; `thenOffer: false` means confirm or Undo, never both), `offer`, `transaction` (acture-undo's `history.transaction` for actions on local state; then the history entry is the Undo, do not offer both), `lock` (`createSelectionLock()`, shared by buttons and commands) and `afterRun`. The hand-written version, for a project that wants no dependency, is [`docs/hand-written-selection-commands.md`](../../docs/hand-written-selection-commands.md).

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

The Phase 1 reference adapter is [`acture-state-zustand`](https://npm.im/acture-state-zustand): `createZustandAdapter({ initialState })`.

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

The example below shows registry composition with a host's state adapter — see [`acture-example-graph-editor`](../../examples/greenfield/graph-editor) for the full worked example.

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
