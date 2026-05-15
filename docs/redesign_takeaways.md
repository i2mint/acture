# Acture Redesign — Key Takeaways

> **Migrated from wrapex 2026-05-12.** `wrapex` / `command-wrapex` have been renamed throughout to `acture`. Section §2.5 (naming) is preserved as historical context but is no longer an open question — the rename is settled. Sections marked **🔬 RESEARCH-GATED** in the original have since been answered by research findings 1–5 at `docs/research/`; see [`v1_plan.md`](v1_plan.md) for the research-informed Phase plan.

**Audience:** Agents (and humans) deciding how to (re)design `acture` and its supporting skills.

**Inputs to this synthesis:**
- [`command_dispatch_journal_article.md`](command_dispatch_journal_article.md) — the central conceptual paper.
- [`reference_notes.md`](reference_notes.md) — distilled per-article notes on every reference cited.
- The current state of the repo (skills, templates, examples, recent commits).

This document is opinionated. It intentionally promotes some ideas to "settled," flags others as "decide-explicitly," and calls out a few "do-not-do" traps. Where references support a claim, they are cited as `[ref_NN]`.

---

## 0. Frame: three modes, two axes

The conversation that prompted this work clarified that `acture` should serve a **2D space**, not a list of three modes:

- **Axis A — Starting point:** *nothing* / *partial app* / *mature app*.
- **Axis B — Target purity:** *command-dispatch as one surface among many* / *command-dispatch as the only mutation entry point*.

The "three modes" are *trajectories or positions* in this space:

| Position label | Starting point | Target purity | Trajectory |
| --- | --- | --- | --- |
| **Mode 1 — Minimize footprint** | Mature app | Low (steady) | None (stays put) |
| **Mode 2 — Strangler-fig migration** | Mature app | High (eventual) | Strangler fig over months/years |
| **Mode 3 — Greenfield-pure** | Nothing | High (from day one) | None (born there) |

**Implication for acture:** the *target purity* is what the public API should make first-class, not the starting point. A team finishing a strangler-fig migration uses the same `defineCommand`/`dispatch`/registry primitives as a greenfield team. What differs is the *adapters* layered on top:

- Greenfield → only the core, plus chosen consumer adapters (palette, MCP, AI).
- Migration → core + transitional adapters (`wrapMutation`, event-interception middleware, dual-handler routing).
- Footprint-minimizer → core + a single consumer adapter (usually palette), with no obligation to ever migrate further.

This matters for marketing, package layout, and the skills directory: the "purist" and "transitional" affordances should be cleanly separable, not entangled.

---

## 1. Settled architectural commitments

These are choices the references converge on strongly enough that the redesign should treat them as defaults. Deviation requires explicit justification.

### 1.1 Three primitives, in the order the article names them

The journal article (§2) is correct: **state model → command registry → schema bridge**, and the only truly sequential dependency is *state model → registry → everything else* [§7.4]. Honor this in code, docs, and the skills directory. Do not ship a "registry-only" mode that lacks any state-model contract — the value of the registry is multiplied by the typed state.

### 1.2 Commands are data, with one real function: `execute`

[ref_13, ref_09, ref_24] all agree: command metadata is *data, not code*. The only function on the command record is `execute`. No serialized expressions, no command inheritance, no JSON-as-handler. `when`-clauses are a *declarative* small DSL or a typed predicate function — not a mini-language with loops.

The supported metadata surface is closed and small:

```
{
  id, title, description?, category?,
  params?,            // Standard Schema (Zod / JSON Schema as const / Valibot)
  when?,              // small DSL string OR (ctx) => boolean
  keybinding?,        // tinykeys string DSL: "$mod+K", "g i"
  aliases?,           // string[]
  defaultScore?,      // number | (ctx) => number
  scale?,             // number | (ctx) => number
  follow?,            // CommandId[]
  execute,            // (params, ctx) => Result | Promise<Result>
}
```

Anything beyond this — undo, telemetry, palette hints, MCP capabilities — is added by **composition** (`undoable(cmd, ...)`, `palettable(cmd, ...)`), not by growing the core record [ref_29: The Wrong Abstraction].

### 1.3 Schema as Single Source of Truth, with JSON Schema as the wire format

[ref_45, ref_08, ref_05, ref_06] converge unanimously: **JSON Schema is the IDL for AI tool calling and MCP**. Acture's "schema bridge" is fundamentally a thin facade over `z.toJSONSchema()` (or equivalent) with a metadata registry.

But: be Standard-Schema-compatible at the boundary, not Zod-locked. Accept any of:

1. **Zod** (default, recommended) — `params: z.object(...)`.
2. **JSON Schema as const** — `params: { type: "object", ... } as const satisfies JSONSchema` [ref_42].
3. **TS interface + ts-json-schema-generator** for migration paths where teams won't rewrite hundreds of typed handlers [ref_43].

At runtime, the registry only sees JSON Schema. All consumer adapters (palette form, MCP, AI tools, Vercel AI SDK) consume JSON Schema, not the source format.

**Hard rule:** keep command param schemas in the JSON-Schema-representable subset. No `z.transform`, `z.date`, `z.bigint`, `z.set`, `z.map`, `z.custom` in command params [ref_08]. Coercion happens in the handler. Validate this at registration time and throw loudly.

### 1.4 Dispatch is the single entry point

Every surface — palette, hotkey, AI tool call, MCP, test, macro replay — calls `dispatch(id, args, ctx?)`. The registry runs validation, gates on `when`, runs middleware, and only then invokes `execute`. There is no "fast path" that bypasses dispatch [ref_01, ref_04, ref_51].

Performance carve-out (per article §6.3): render-frequency operations stay as direct function calls. Dispatch is for **human-frequency** operations. Document this loudly to head off "but my game loop" objections.

### 1.5 Owner-scoped lifecycle (Disposable pattern)

Every `register*` call returns a `Disposable` (`{ dispose(): void }`) [ref_11]. Owners group disposables; `owner.dispose()` removes everything they registered. This is the right pattern; the existing implementation (commit `bb9a790`) keeps it. Do **not** generalize beyond what two real callers need [ref_27: YAGNI].

### 1.6 Two-tier API per UI primitive

Borrowing from VS Code's `showQuickPick`/`createQuickPick` split [ref_46]: every UI/IO primitive should expose both a simple promise API and a stateful/eventful API. Applies to the palette, the param collector, the picker, and the input box. Don't ship only the high-level form — power users hit a wall.

### 1.7 Keybindings as serializable strings

Adopt tinykeys' DSL verbatim [ref_20]: `"$mod+K"`, `"g i"`, `"$mod+([0-9])"`. Keybindings are strings on the command record. The registry parses them at registration and binds them via `createKeybindingsHandler`-style attachment so contexts (modal open, editor focused) can scope them. Strings are also serializable to user prefs and inspectable by AI/MCP — opaque function bindings are not.

### 1.8 Errors-as-data on command results

[ref_05] is the spec: command results should be a discriminated union with an explicit error variant, not thrown exceptions across consumer boundaries. Throwing inside `execute` is fine; the dispatcher catches and converts. This preserves LLM observability (the model can react to the error) and matches the MCP wire format directly.

### 1.9 Registry events for hot reconfiguration

Emit `commandsChanged` events (or equivalent observable) when commands are added/removed [ref_05]. Palettes, MCP servers, and LLM tool lists need to refresh. Don't make consumers poll.

---

## 2. Decide-explicitly choices (these need a call before implementation)

These are choices where the references show real, defensible alternatives. Pick one, document the trade-off, don't try to do both.

### 2.1 `when`-clause: string DSL vs. typed predicate

- **Option A — VS Code-style string DSL** [ref_10]: `"editorFocus && resourceLangId == typescript"`. Serializable, AI-readable, exportable to MCP, but requires a parser/evaluator and a context-key store.
- **Option B — Typed predicate function**: `when: (ctx) => ctx.editorFocus && ctx.resourceLangId === 'typescript'`. Zero parsing, full type safety, but opaque to AI/MCP/serialization.
- **Option C — Both, with the function as escape hatch.** This is the recommended path: ship the string DSL as the primary, with `(ctx) => boolean` allowed but flagged as "not exposable to AI/MCP."

**Recommendation:** Option C. Ship the small DSL (`!`, `&&`, `||`, `==`, `!=`, `>=`, `<=`, `=~`, `in`, `not in`) plus a context-key store; allow the function escape hatch. Without the DSL, the AI/MCP surface degrades.

### 2.2 React/UI coupling: cmdk-as-dependency vs. cmdk-shaped

- **Option A — Depend on cmdk** [ref_18]. Mature, unstyled, composable slot API. Saves reinventing combobox semantics.
- **Option B — Implement a cmdk-shaped store** in acture. More work; avoids the dependency; lets acture own the React-version compatibility story.

**Recommendation:** Option A for the default `<CommandPalette/>` adapter, but keep the registry **fully decoupled from React** so non-React consumers (MCP server, LLM tools, tests) don't pay the cost. cmdk lives in `acture-palette-react`, never in `acture-core`.

### 2.3 Param collector UI: AutoForm vs. rjsf vs. both

[ref_48, ref_49] are the two contenders.

- **AutoForm** is Zod-native and lighter; fits the recommended Zod-first authoring path.
- **rjsf** is JSON-Schema-native and more mature; fits the JSON-Schema-as-const authoring path.

**Recommendation:** ship **two thin adapters** (`acture-forms-autoform`, `acture-forms-rjsf`), each with a `paramCollector(schema)` API. The acture registry does not bundle a form library. This matches the `SchemaProvider` pattern AutoForm itself uses.

### 2.4 Undo subsystem: in v1 or after?

[ref_24] makes a strong case that "undo stops being a feature and starts being part of your architecture" — but [ref_27: YAGNI] warns against shipping speculative subsystems.

**Recommendation:** ship undo as a **separate package** (`acture-undo`) that depends on `acture-core` but is **not pulled in by default**. v1 of `acture-core` should standardize the *hooks* needed to make undo possible later — specifically, `execute` may return `{result, patches?, effects?}` — so opting in is non-disruptive. Do not ship redo-after-edit (GURQ) until a real user needs it.

### 2.5 Naming: settled — `acture`

> **Resolved 2026-05-12.** The library was renamed from `wrapex` / `command-wrapex` to `acture`. The "wrap" framing carried migration baggage that did not fit greenfield-pure or footprint-minimizer modes. Both `acture` on npm and `acture` on PyPI are free; both reserved this session. The three positioning paths live in documentation, not in the package name. This section is preserved as historical context for the original deliberation.

### 2.6 Sandboxing / extension trust model

[ref_03] (Figma) shows the membrane pattern; [ref_12] (VS Code) chooses process isolation; [ref_06] (Vercel AI SDK) ships unsandboxed because tools are first-party.

**Recommendation:** **Do not build a sandbox in v1.** Adopt VS Code's "trusted extension" model: extensions register commands directly. If a real third-party extension ecosystem ever emerges, the membrane pattern is the migration path — but [ref_27] applies. This is a textbook architecture-astronaut trap.

---

## 3. Hard "don'ts"

These are anti-patterns the references collectively rule out. They should be enshrined in CONTRIBUTING and code review checklists.

1. **No conditional logic in command metadata.** [ref_13] If you're tempted to add `command.if`, stop. Refactor into two commands, or push the conditional into `execute`.
2. **No god-package.** [ref_14, ref_27] Ship `acture-core` plus per-consumer adapter packages (`acture-palette-react`, `acture-mcp-server`, `acture-ai-vercel`, `acture-hotkeys`, `acture-undo`, `acture-forms-*`, `acture-test-property`). Tree-shake-friendly. Mode-1 users grab one or two; greenfield users grab more.
3. **No business logic in adapter packages.** [ref_14] Adapters translate. If you find yourself adding behavior in `acture-mcp-server`, it belongs in `acture-core`.
4. **No `if (mode === ...)` in shared helpers.** [ref_29] When a new caller almost-fits, prefer composition or a separate helper. Duplication is cheaper than the wrong abstraction.
5. **No `eval()`-ing LLM-produced JSON or argument strings.** [ref_04] The dispatcher takes a `(name, args)` pair, validates against the schema, and routes via the registry's `Map<string, Command>`. Never reflectively call.
6. **No coupling the registry to React.** [ref_19] kbar's `KBarProvider`-only access is the failure mode. The registry is a plain object; React adapters consume it.
7. **No promoting an experimental API to stable without a migration story.** [ref_26] Set a 3–6 month deadline on every experimental feature.
8. **No bundling a UI kit.** [ref_48, ref_49] Let users plug in shadcn/MUI/Mantine via adapter packages.
9. **No marketing on category.** [ref_30] The README leads with a concrete user win, not "a unified dispatch architecture."
10. **No assuming the LLM's chosen function is authorization.** [ref_04] Schema validation happens at the dispatcher, regardless of caller. The LLM proposes; the registry decides.

---

## 4. Documentation and skills topology

The references and the user's framing both push toward a clear branching of docs and skills by mode/position. Concretely:

### 4.1 Top-level docs
- **README.md** opens with the Napster framing [ref_30]: "Type a command name. Get a working palette, AI tool, and MCP server for free." Then a "Greenfield or migrating?" branch that points at one of two paths:
  - `getting-started/greenfield.md` — opinionated bootstrap, schema-first, no migration vocabulary.
  - `getting-started/migration.md` — strangler-fig narrative [ref_07, ref_32], `wrapMutation` adapters, the `01-diagnose` → `04-wrap` skill flow.
- The journal article ([`command_dispatch_journal_article.md`](command_dispatch_journal_article.md)) stays as the *conceptual* reference, not the entry point.

### 4.2 Skills (in `.claude/skills/`)
- Existing 01–04 (diagnose, plan, scaffold, wrap) → relabel as **migration-track** skills.
- New `00-greenfield-bootstrap.md` → schema-first state model, registry as only mutation entry point, no legacy adapters needed, examples written from scratch (not wrapping).
- Existing 05–13 (enrich, wire-to-palette, wire-to-AI, wire-to-MCP, wire-to-tests, etc.) → universal; usable from either track.
- A new `99-graduation.md` for mode-2 teams: how to retire the transitional adapters once the migration is complete (the "let the host die" step in the strangler-fig metaphor).

### 4.3 Examples
- Existing four `wrap-*` examples are migration examples (mode 2). Keep them under `examples/migration/`.
- Add `examples/greenfield/` with at least one fully command-dispatch-first toy app (e.g., a tiny graph editor: every action is a command, no direct mutations).

### 4.4 The migration-mechanic adapters as first-class API
[ref_07, ref_31, ref_32] all support shipping deliberate "transitional architecture" affordances:

- `wrapMutation(legacyHandler, spec)` — wrap an existing function as a command.
- `divertHandler(commandId, { legacy, modern, predicate })` — per-command routing between old and new implementations (the dispatcher's analog of nginx edge routing [ref_31]).
- Event-interception middleware that lets some events transparently become command dispatches.

These are migration-track APIs. They live in `acture-migration` (or a sub-export) and are *explicitly* off the greenfield path.

---

## 5. Strawman package layout

Concretely, what to ship. (Subject to the YAGNI rule: only what's needed by a real consumer goes in v1.)

```
acture-core              # Registry, dispatch, schemas, when-clause DSL, owner lifecycle. No React, no UI.
acture-palette-react     # cmdk-based default palette UI. Depends on core.
acture-hotkeys           # tinykeys binding. Plain DOM, optional React hook.
acture-forms-autoform    # Zod → form. Optional.
acture-forms-rjsf        # JSON Schema → form. Optional.
acture-ai-vercel         # Adapter to Vercel AI SDK tools.
acture-mcp-server               # Adapter to MCP TS SDK (server + client). Errors-as-data.
acture-test-property     # fast-check arbitraries derived from command schemas.
acture-undo              # Patch-based undo, transactions, effect queue. Opt-in.
acture-migration         # wrapMutation, divertHandler, event-interception. Mode-2 only.
acture-devtools          # Inspector: registry contents, dispatch log, when-clause evaluator.
```

`acture-core` is the only required dependency. Mode-1 users typically take `core + palette-react + hotkeys`. Mode-3 users add `ai-vercel` + `mcp` + `test-property` from day one. Mode-2 users add `migration` until they delete it.

---

## 6. Where the "rule of three" applies — and where it doesn't

**The rule of three is a soft heuristic for the *application developer using acture*, not a meta-rule for acture maintainers.** This was previously misapplied: earlier drafts of this section turned the article's §6.2 rule "inward" — "don't ship an acture feature until three real usage paths demand it" — which was wrong. The rule belongs in the user's hands, not in the maintainer's scope-decision process.

**For acture *users* (application developers):** the rule of three is a soft check on premature abstraction. When you find yourself wondering whether some operation should be formalized as a `defineCommand` entry, the heuristic says: wait until that operation is triggered from ~3 surfaces (button click, keyboard shortcut, AI tool call, MCP, test, macro, …) before paying the cost of formalization. It is a *softening* of YAGNI suited to multi-surface frontends — not a hard gate, and not a count to enforce. The journal article's own §6.2 already nuances it: because acture amortizes formalization cost across multiple surfaces, the threshold is reached sooner and more naturally than under ad-hoc integration. Skills surfaces tell users this softly, where it's helpful.

**For acture *maintainers* (us):** the rule of three does NOT apply. We are building tooling that *helps* application developers stand up command-dispatch architectures; deferring our own work on a numeric-callers gate would defeat the point. The principles that actually govern what acture ships are:

- **YAGNI / wait for a concrete need.** Don't build infrastructure for hypothetical consumers — but the test is "is there a real need we can name and shape," not "are there exactly three of them."
- **Hard-don't #2 (no god-package).** A new acture package must be a single accelerator, not a bundle. This is what guards against the speculative-package-creation drift, not a callers count.
- **Architecture-astronaut avoidance (journal §6.4).** Every increment ships user-facing value; if it doesn't, that's the red flag.
- **The dev-tool-first principle (§`docs/positioning.md`).** Every new acture artifact has a documented agent-written path; speculative infrastructure is impossible to defend if the same value is reachable by hand.

Together these are stricter and more honest than a callers count. They name *why* a feature is or isn't worth shipping, rather than asking "are there three of something yet."

Historical note: a number of past scope decisions invoked the rule of three when they should have invoked one of the principles above. The decisions themselves still hold (declining `acture-sequence`, the `.d.ts` tier mirror, a one-rule new ESLint plugin); the *framing* in those reflections is stale — they were correct calls for adjacent reasons (god-package risk, no concrete consumer, YAGNI), not because a numeric gate failed. New work should use the correct framing.

### What this section still says about specific shapes

Independent of the rule-of-three rescope, the categorical shapes below still hold and reflect the central paper's risk analysis:

- ❌ Architecture-astronaut traps to never ship: a config DSL inside command metadata, a custom wire format faster than JSON, a "general-purpose" middleware framework, a built-in form-rendering UI kit.
- The decision between shipping a new feature in v1.x and deferring to a later release is *deliberate scope*, not a count.

---

## 7. Two specific naming/framing changes worth making

Small but high-leverage, derived from [ref_30] and [ref_50]:

1. **Replace "command dispatch architecture" with a concrete-first headline** in user-facing surfaces. Internal docs and the journal article keep the term; the README does not. Example headline: *"One schema. Palette, hotkeys, AI tools, MCP, and tests — for free."*
2. **Distinguish atomic vs. handoff commands** in the schema [ref_50]. A `kind: "atomic" | "handoff"` field tells the palette whether to complete in-place or pop a UI surface. Cheap to add, expressive, prevents the temptation to push every UI flow through the palette.

---

## 8. What the user asked us to align on

Re-stating the user's three modes and what the takeaways above imply for each:

- **Mode 1 (minimize footprint):** Position as "drop-in palette + MCP for your existing app." Killer demo: 5 minutes to add `<CommandPalette/>` and `toMcpServer(registry)` over existing actions via `wrapMutation`. Don't push them toward purity.
- **Mode 2 (full migration):** Position as the strangler-fig story explicitly. Ship the `migration` package, the diagnose/plan/wrap skills, the divert-handler primitive. Make "graduation" (deleting the transitional layer) a first-class endpoint with its own skill.
- **Mode 3 (greenfield-pure):** Position as "schema-first command-dispatch from day one." New `00-greenfield-bootstrap.md` skill. Opinionated starter: state schema → command registry → dispatch is the only mutation. Optional ESLint rule that flags non-dispatch mutations [ref_34]. No `migration` package on the dependency tree.

The library that serves all three is the **same registry, dispatcher, and schema bridge**, with different *surrounding adapter packages* and different *documentation paths*. No mode-aware conditionals inside the core.

---

## 9. Open architectural questions that the references *don't* settle

These remain genuinely undecided after reading. Discuss before committing:

1. **State model substrate:** zustand (current default) vs. allowing Redux Toolkit, Jotai, MobX, Valtio adapters. zustand+immer matches [ref_24]'s undo recipe well. Locking in is opinionated; staying agnostic is harder.
2. **Async story for `execute`:** sync-first with optional async [ref_03] is best for ergonomics, but most realistic commands hit a network. Decide whether `execute` returns `Result | Promise<Result>` (current sketch) or always `Promise<Result>` (simpler, slightly worse for ergonomics).
3. **Context-key store:** plain object updated imperatively (VS Code style [ref_10]) vs. a reactive zustand slice (matches the rest of the stack). The latter is more idiomatic JS but more coupling.
4. **Schema versioning and breaking-change CLI:** [ref_45] argues strongly for a `acture compare-schemas` CLI. Worth deferring until a concrete need is named.
5. **Recursive parameter types:** [ref_08, ref_42] both flag recursion as a sharp edge. Decide whether to support it in v1 (and constrain how) or defer.

These questions are worth a separate discussion thread or a deep-research pass — see the companion file [`research_prompts.md`](research_prompts.md).

---

## 10. TL;DR for an agent picking up the redesign

1. **Ship a small, opinionated `acture-core` plus tree-shakeable adapter packages.** No god-package. No bundled UI.
2. **The command record is closed and small.** Add capabilities via composition, not by growing the record.
3. **Schema bridge = JSON Schema.** Authoring layer can be Zod, JSON Schema literals, or generated from TS. Standard Schema at the boundary.
4. **Dispatch is the only entry point.** All surfaces go through it. Errors-as-data. Owner-scoped lifecycle.
5. **Three docs paths**: greenfield, migration, footprint-minimizer. The same primitives serve all three; only the adapters and skills differ.
6. **Defer everything not load-bearing.** Undo, macros, telemetry, sandboxing — all post-v1 unless three real callers ask.
7. **Lead user-facing copy with a concrete win**, not architectural unification [ref_30].
