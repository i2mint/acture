# The hand-written registry — a reproducible reference

**Status:** reference artifact. This document makes acture's dev-tool-first
promise *true in the code*: a developer can stand up command dispatch with
**zero `acture-*` dependency** by hand-writing the registry primitive,
following this reference.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. The
short version: `acture` core (the npm package) is an *optional accelerator*.
The registry, the dispatcher, the `Result` type — all of it can be code the
target project *owns outright*. This doc is the legible reference an agent
adapts; `packages/core/src/` is the tested implementation an agent installs
instead, if the team chooses to.

---

## When to hand-write vs. install `acture`

| | Hand-write (this doc) | `pnpm add acture` |
| --- | --- | --- |
| Dependency added | none | one (`acture` + `zod` peer) |
| Code the team owns | ~80 lines, in their repo | the import surface |
| When-clause DSL | function form only (`(ctx) => boolean`) | full string DSL **for free** |
| Schema → JSON Schema bridge | hand-write if/when an AI/MCP surface needs it | `toJsonSchema` **for free** |
| Tier system, `compare-schemas` CLI | not included | available |
| Maintenance | the team's | acture's |

Hand-writing is the right call when the project wants the *architecture*
without the *dependency* — a small command set, no AI/MCP surface yet, or a
team that prefers to own every line. Installing `acture` is the right call
when the registry will carry many commands, when the schema bridge or tier
system earns its keep, or when "tested and maintained elsewhere" is worth a
dependency. **It is a per-project trade, made deliberately — never a default.**

The two paths are compatible: a project can hand-write the registry today and
swap in `acture` core later (or vice versa). The shapes below are deliberately
the same shapes acture exports, so the migration is mechanical.

---

## The minimal registry

This is a complete, self-contained command-dispatch layer. Copy it into the
target project (e.g. `src/registry.ts`), adapt the names, delete what the
project doesn't need. It has **no dependencies** beyond a schema validator —
and even that is optional (see "Parameter validation" below).

```ts
/* ── Result: errors-as-data ─────────────────────────────────────────── */

export type Result<R> =
  | { ok: true; value: R }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export const ok = <R>(value: R): Result<R> => ({ ok: true, value });
export const err = (
  code: string,
  message: string,
  details?: unknown,
): Result<never> => ({ ok: false, error: { code, message, details } });

/* ── Context + the schema validator boundary ────────────────────────── */

/** Arbitrary per-dispatch context. The project decides what goes in. */
export type Context = Record<string, unknown>;

/** A parameter schema. Any object with a `safeParse` is accepted — Zod
 *  already matches this shape, so `params: z.object({...})` just works.
 *  Swap in Standard Schema's `~standard.validate` if you prefer. */
export interface ParamSchema<P> {
  safeParse(input: unknown):
    | { success: true; data: P }
    | { success: false; error: unknown };
}

/* ── CommandRecord: the closed metadata surface ─────────────────────── */

export interface CommandRecord<P = unknown, R = unknown> {
  /** Stable namespaced id, convention `app.domain.action`. */
  readonly id: string;
  /** Human-readable label for palettes / menus. */
  readonly title: string;
  readonly description?: string;
  /** Parameter schema. Validated at the dispatcher, before `execute`. */
  readonly params?: ParamSchema<P>;
  /** Availability predicate. Function form only in the hand-written
   *  registry; acture core also accepts a string DSL. */
  readonly when?: (ctx: Context) => boolean;
  /** The handler. Throwing inside is fine — the dispatcher catches it. */
  readonly execute: (params: P, ctx: Context) => Result<R> | Promise<Result<R>>;
}

/** Author + freeze a command. Mirrors acture's `defineCommand`. */
export function defineCommand<P, R>(
  spec: CommandRecord<P, R>,
): CommandRecord<P, R> {
  if (!spec.id || typeof spec.id !== 'string') {
    throw new Error('CommandRecord.id is required');
  }
  if (typeof spec.execute !== 'function') {
    throw new Error(`CommandRecord(${spec.id}).execute must be a function`);
  }
  return Object.freeze({ ...spec });
}

/* ── The registry: a Map + a dispatcher ─────────────────────────────── */

export function createRegistry() {
  const commands = new Map<string, CommandRecord>();

  return {
    register(cmd: CommandRecord): () => void {
      if (commands.has(cmd.id)) {
        throw new Error(`Command "${cmd.id}" is already registered`);
      }
      commands.set(cmd.id, cmd);
      return () => {
        if (commands.get(cmd.id) === cmd) commands.delete(cmd.id);
      };
    },

    get: (id: string) => commands.get(id),
    has: (id: string) => commands.has(id),
    list: () => [...commands.values()],

    async dispatch<R = unknown>(
      id: string,
      params?: unknown,
      ctx: Context = {},
    ): Promise<Result<R>> {
      const cmd = commands.get(id);
      // 1. Unknown command — fail closed. NEVER reflectively call.
      if (!cmd) return err('unknown_command', `No command "${id}"`);

      // 2. when-clause gate.
      if (cmd.when && !cmd.when(ctx)) {
        return err('when_clause_failed', `"${id}" not available here`);
      }

      // 3. Validate params at the boundary — regardless of caller.
      let parsed: unknown = params;
      if (cmd.params) {
        const r = cmd.params.safeParse(params);
        if (!r.success) {
          return err('invalid_params', `Invalid params for "${id}"`, r.error);
        }
        parsed = r.data;
      }

      // 4. Run the handler; convert a thrown error to errors-as-data.
      try {
        return (await cmd.execute(parsed, ctx)) as Result<R>;
      } catch (e) {
        const error = e as Error & { code?: string };
        return err(error.code ?? 'execute_threw', error.message ?? String(e));
      }
    },
  };
}
```

That's the whole primitive. ~80 lines, zero dependencies, owned by the project.

---

## Why each piece is shaped this way

These are not stylistic choices — each one defends against a documented
failure mode (see [`docs/redesign_takeaways.md`](redesign_takeaways.md) §3 and
the `acture-hard-donts` skill). Keep them when you adapt the code.

- **Errors-as-data (`Result<R>`), not exceptions across the boundary.**
  `dispatch` *always* resolves to a `Result`. Callers branch on `result.ok`;
  they never wrap dispatch in try/catch. A handler may still `throw` for
  convenience — step 4 catches it and converts it.

- **`dispatch` takes `(id, params)` and routes via `Map.get`.** It NEVER
  uses `eval`, `new Function`, or reflective invocation. This is the single
  most important line for security: an LLM or MCP client proposing a tool
  call hands you a *string id* and a *params object*; an unknown id returns
  `{ ok: false, error: { code: 'unknown_command' } }` and nothing runs.

- **Params are validated at the dispatcher, for every caller.** There is no
  "trusted caller" fast-path. The LLM proposes; the registry decides.
  Skipping validation by surface (`surface === 'ai'`) is how prompt injection
  bypasses your schema — don't add that branch.

- **The `CommandRecord` surface is closed.** `id`, `title`, `description?`,
  `params?`, `when?`, `execute` — and in full acture core, ten more
  (`category`, `icon`, `keybinding`, `aliases`, `kind`, `tier`,
  `deprecationReason`, `internalToken`, `defaultScore`, `follow`) for 15
  total. Resist adding fields. If you want conditional logic, write two
  commands or push the condition into `execute` — metadata is data, not a
  mini-language (the Inner Platform Effect).

- **The registry is plain TypeScript — zero React, zero state library.** It
  is constructible from a Node script, an MCP server, a test runner, a
  keyboard daemon. If you find yourself importing `react` here, stop: the
  registry must outlive any component's lifetime.

- **`register` returns a disposer.** Owner-scoped cleanup: a feature module
  registers its commands and gets one function back that unregisters exactly
  them. The `commands.get(cmd.id) === cmd` guard makes the disposer safe to
  call after the id was re-registered by someone else.

---

## Parameter validation — three options

The `params` field is typed against a `safeParse` shape so the registry
itself is validator-agnostic:

1. **Zod** (acture core's default). `params: z.object({ x: z.number() })`
   works as-is — Zod's `.safeParse` already returns `{ success, data }` /
   `{ success: false, error }`.
2. **Standard Schema.** Adapt step 3 to call `schema['~standard'].validate`
   — that gives you Valibot, Arktype, and others.
3. **No library.** Write a hand-rolled `safeParse` per command, or skip
   `params` entirely for commands whose input is already typed at the call
   site. The registry doesn't care.

Whatever you pick: **keep param schemas in the JSON-Schema-representable
subset** (no `transform`, `date`, `bigint`, `set`, `map`, `custom`). The day
the project grows an AI/MCP surface, those schemas have to round-trip through
JSON Schema. Coercion belongs in `execute`, not the schema.

---

## What this reference deliberately omits

The hand-written registry is the *primitive*. Everything below is something
acture core ships that you would otherwise hand-write **only when a real need
appears in your project** — YAGNI applied softly. Don't pre-build for a
hypothetical consumer:

- **The when-clause string DSL.** acture core parses `"editor.focused && !view.readonly"`.
  The hand-written version takes a function instead — `when: (ctx) => ctx.editor?.focused`.
  The function form covers every case; the DSL is just nicer to author and is
  statically inspectable by AI/MCP projections. ~500 lines of parser you don't
  write unless you want it — a concrete example of what "install `acture`" buys.
- **The schema bridge (`toJsonSchema`).** Needed when you add an AI tool-calling
  or MCP surface. Hand-write a `CommandRecord → { name, description, inputSchema }`
  projection then, or install `acture` core for the tested one.
- **The tier system** (`@stable` / `@experimental` / `@internal`), the
  `compare-schemas` CI gate, the `commandsChanged` event stream, `registerAll`
  with batched rollback, the `StateAdapter<S>` interface. Add the ones a
  consumer actually needs, when it needs them.

When you *do* add a consumer surface (palette, hotkeys, MCP, AI, e2e), follow
the `acture-consumer-integration` skill — the same dev-tool-first logic applies
per consumer: hand-write it, or install the matching `acture-*` package, as a
deliberate per-consumer choice.

---

## Faithfulness note

The shapes here mirror `packages/core/src/` exactly — `Result`, `Context`,
`CommandRecord`, `defineCommand`, `createRegistry`, the four error codes
(`unknown_command`, `when_clause_failed`, `invalid_params`, `execute_threw`).
That is intentional: an agent that hand-writes from this doc and later
installs `acture` core finds the migration mechanical. If core's contract
changes, this doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- `acture-greenfield` skill — walks an agent through using this reference in a new project.
- `acture-consumer-integration` skill — the same per-consumer choice for palette / hotkeys / MCP / AI / e2e.
- `packages/core/src/` — the tested implementation this reference mirrors.
- [`docs/redesign_takeaways.md`](redesign_takeaways.md) §3 — the failure modes the shapes defend against.
