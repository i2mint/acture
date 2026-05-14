---
name: acture-command-record-shape
description: Load the canonical CommandRecord shape and the closed-metadata-surface principle. Use when defining, modifying, reviewing, or extending the CommandRecord interface, when adding a new field, when removing/renaming a field, or when asked about command identity, schema, when-clauses, kind (atomic/handoff), tier, keybindings, or the Result<R> shape. Triggers on "CommandRecord", "defineCommand", "command metadata", "what fields does a command have", "add a field to commands", "the dispatch signature". Do NOT use for palette/UI behavior (load `acture-palette-design`) or migration helpers (load `acture-migration-package`).
---

# The acture CommandRecord shape

The `CommandRecord` is acture's central type. It is **closed** — fields cannot be added without three-caller validation. This skill is the canonical spec.

## The spec

```ts
type CommandRecord<P = unknown, R = unknown> = {
  /** Stable namespaced ID. Convention: 'app.domain.action' (verb-noun).
   *  Examples: 'app.graph.addNode', 'app.view.zoomToFit', 'app.data.applyFilter'. */
  id: string;

  /** Human-readable label for palette, menus, tooltips. */
  title: string;

  /** One-sentence description. ALSO the LLM-facing tool description.
   *  IMPORTANT: per research-5 §6.2, description changes are MAJOR-by-default in compare-schemas. */
  description?: string;

  /** Discovery aid only. Palettes group by this. NOT part of dispatch semantics. */
  category?: string;

  /** Discovery aid only. */
  icon?: string;

  /** Parameter schema. Standard Schema accepted at boundary: Zod (default),
   *  JSON Schema as const, Valibot. Registry normalizes to JSON Schema.
   *  HARD CONSTRAINT: param schemas must be in JSON-Schema-representable subset.
   *  No z.transform, z.date, z.bigint, z.set, z.map, z.custom in params. Coercion
   *  belongs in the handler, not the schema. Validate at registration time. */
  params?: StandardSchema<P>;

  /** Availability predicate. DSL string OR (ctx) => boolean.
   *  Function escape hatch is flagged "not exposable to AI/MCP" — the registry's
   *  toMCPServer/toAITools projections omit when-as-function commands from
   *  description-time availability metadata. */
  when?: string | ((ctx: Context) => boolean);

  /** Keybinding(s) as tinykeys DSL: "$mod+K", "g i", "$mod+([0-9])".
   *  First-class field per research-1 (convergent across Obsidian/Raycast/Linear). */
  keybinding?: string | string[];

  /** Search aliases for palette. */
  aliases?: string[];

  /** Atomic vs. handoff (research-2). Auto-derived if omitted; explicit override here.
   *  - "atomic": palette collects params in-place via picker chain.
   *  - "handoff": palette closes; opens a dedicated form view derived from same schema.
   *  Auto-derivation heuristic (research-2 §9.3):
   *    - 0 params: atomic
   *    - 1-2 params, all picker-typed: atomic
   *    - 3 params, all picker-typed AND all with defaults: atomic
   *    - otherwise: handoff
   */
  kind?: "atomic" | "handoff";

  /** Tier (research-5). Authoritative source is the JSDoc tag on the defineCommand
   *  call site (@stable / @experimental / @internal / @deprecated). The build step
   *  (acture-build-tier) mirrors the tag into this field. Authors normally do NOT
   *  write this field manually — they write the JSDoc tag. */
  tier?: "stable" | "experimental" | "internal" | "deprecated";

  /** Free-text reason injected by the build step from @deprecated <reason>.
   *  Adapter packages (acture-mcp, acture-ai-vercel) prepend
   *  `[DEPRECATED — <reason>]` to the description; acture-devtools surfaces
   *  it in the inspector. Added in v1.0 (Phase 4) under the rule of three. */
  deprecationReason?: string;

  /** Module-scoped Symbol attached by the build step when a command is tagged
   *  @internal. The runtime checks identity at dispatch — cross-module callers
   *  cannot see the token because it lives in the registering module's closure.
   *  Authors do NOT write this manually. Added in v1.0 (Phase 4). */
  internalToken?: symbol;

  /** Default ranking score in palette (optional). */
  defaultScore?: number | ((ctx: Context) => number);

  /** Suggested follow-up command IDs for palette hints (optional). */
  follow?: string[];

  /** The handler. Receives validated params and execution context.
   *  Returns a discriminated-union Result. Throwing is fine inside execute;
   *  the dispatcher catches and converts to {ok: false, error}. */
  execute: (params: P, ctx: Context) => Result<R> | Promise<Result<R>>;
};
```

## Result<R> shape

```ts
type Result<R> =
  | { ok: true; value: R; patches?: Patch[]; effects?: Effect[] }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

The `patches?` and `effects?` fields are **reserved hooks** for `acture-undo` (post-v1). v1 core ignores them. They exist so adding undo later is non-breaking.

## Fields that are deliberately NOT on this record

These were proposed at various points and rejected. Do not add them.

| Field | Why not |
| --- | --- |
| `inputComponent?: unknown` | UI components live in palette adapter config, not on commands. |
| `metadata: PolicyMetadata` (`readOnly`, `idempotent`, `riskLevel`, `requiresConfirmation`) | The wrapex implementation had this bag. Rejected: too many ad-hoc fields, none load-bearing. `readOnly`/`requiresConfirmation` may return as top-level fields if three callers demand them. |
| `tags?: string[]` | `category` + `tier` cover the use cases. |
| `isVisible?`, `isEnabled?` callbacks | Folded into `when`. Use the function escape hatch. |
| `requiresConfirmation: boolean` at top level | Confirmation is a middleware concern, gated by `kind` and tier. |
| `version?: string` per-command | Pinned to consumer package version; per-tool semver deferred until SEP-1575 lands (research-5 §3). |

## defineCommand helper

```ts
export function defineCommand<TParams, TResult>(
  spec: CommandRecord<TParams, TResult>
): Readonly<CommandRecord<TParams, TResult>> {
  validateAtRegistration(spec); // throws if schema uses unsupported features, ID is malformed, etc.
  return Object.freeze(spec);
}
```

**Registration-time validation MUST check:**
- `id` matches `/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/` (namespaced dot-separated).
- `params` (if present) is in the JSON-Schema-representable subset (no transform, date, bigint, set, map, custom).
- `when` (if string) is parseable as DSL.
- `kind` (if explicit) is one of the two enum values.
- `tier` (if explicit) is one of the four enum values.

## ID naming conventions

- Namespaced dots: `app.domain.action`.
- `app.` prefix configurable; default `app`.
- Action is camelCase, verb-first: `addNode`, `zoomToFit`, `applyFilter`.
- One word per segment. `app.graph.addNode`, not `app.graph_model.add_node`.
- Avoid abbreviations except universally known (`png`, `csv`, `sql`).

## Adding a new field

Before adding ANY new field:

1. Name three concrete callers (commands, adapters, or consumer surfaces) that need it.
2. Confirm it cannot be done by composition (a wrapper function like `palettable(cmd, ...)` or `toolCallable(cmd, ...)`).
3. Confirm it doesn't introduce conditional logic into metadata (inner platform effect).
4. Write the migration story: how does v1 code adopt the new field without breaking?

If any of these fails: do not add the field. Use composition.

## Why the surface is closed

Per `docs/redesign_takeaways.md` §1.2 and the central paper §6.1. The Inner Platform Effect is the most dangerous risk: command metadata growing toward a mini-language with conditionals, inheritance, and dynamic composition. The guardrail is structural: keep the interface minimal and resist additions. If a use case requires conditional logic, it belongs in the handler, not the metadata.

## See also

- `acture-schema-bridge` — how `params` becomes JSON Schema / MCP tool / AI tool
- `acture-palette-design` — how `kind` drives palette UX
- `acture-tier-system` — how `tier` is enforced at runtime
- `docs/v1_plan.md` §4 — same spec, with research-citation trail
