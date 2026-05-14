# Phase 1 Reflection

**Authored:** 2026-05-13 by the Phase 1 implementing agent. Acceptance details in [`phase-1-acceptance.md`](phase-1-acceptance.md). All 94 tests pass (72 core + 7 state-zustand + 8 palette-react + 7 example integration), all four packages typecheck and build, the graph-editor's Vite dev server serves the app and its production bundle is ~107 KB gzip.

This file answers the six questions from `docs/implementation_plan.md` §"Phase 1 → Pre-next-phase reflection checklist".

---

## 1. Did the CommandRecord shape feel right?

**Yes, with two observations:**

**Fields I reached for and used:** `id`, `title`, `description`, `category`, `keybinding`, `params`, `when`, `tier`, `execute`. That is the canonical use-set for any non-trivial command. The graph-editor has six param-free commands + one parameterized + one parameterized helper (`app.selection.set`) + one internal reset (`app.dev.resetState`) and they fit into the shape without friction.

**Fields I did NOT use in Phase 1:**
- `aliases`, `icon`, `defaultScore`, `follow` — never reached for. The graph editor isn't large enough to need them. They're cheap to leave in the surface as Phase 2 inputs and have known consumers (`aliases` for palette ranking, `icon` for VS Code-style affordances).
- `kind` — the field exists but Phase 1's palette ignores it (parameter-free commands are implicitly atomic). Phase 2 will exercise it via the picker chain. **Leave as-is.**

**Fields I wanted to add but resisted:** none in Phase 1. The rule of three held: any "I wish there were a `confirmBeforeExecute` field" temptation was correctly defused by realizing confirmation is a middleware concern.

**One subtle finding** that should propagate to the docs: `CommandRecord<P, R>` with `AnyCommandRecord = CommandRecord<unknown, unknown>` causes contravariance pain when a typed `CommandRecord<{x:number}, string>` is passed to `registerAll(cmds: AnyCommandRecord[])`. I switched `AnyCommandRecord` to `CommandRecord<any, any>` (with a comment explaining why). The user-facing types stay precise (`defineCommand<P, R>` still infers P, R); only the erased-storage type uses `any`. **This is a TypeScript-variance concession, not a design change.** Documented in `types.ts`.

**Recommendation for Phase 2:** no changes to the record shape. The auto-derived `kind` heuristic happens at palette time, not at record-definition time, so it doesn't grow the surface.

## 2. Did the StateAdapter interface stretch to cover the zustand case cleanly?

**Yes.** The dual-form `setState(updater: (s) => S | void)` works for both Immer-style mutate-the-draft (`s.count = 42`) and plain return-a-new-object (`{ ...s, count: 42 }`) inputs. I verified both paths in `packages/state-zustand/src/index.test.ts > accepts mutate-the-draft (returns void) updaters`.

**The friction I expected but didn't hit:** wrapping `zustand/vanilla`'s native `subscribe(listener: (state, previousState) => void)` against acture's `subscribe(listener: (next, prev) => void)`. Zustand already passes both arguments natively; the adapter just forwards them. RTK won't be able to pass `previous` cleanly (it's not tracked) — the StateAdapter contract documents that adapters that can't track `previous` should pass the same value as `current`. That's still acceptable; Phase 2 will confirm with the RTK adapter.

**Patches-capable extension was clean.** `setStateWithPatches` wraps `produceWithPatches` from `immer`; the resulting Immer patches are mapped to acture's `Patch` type (which is RFC-6902-shaped). `applyPatches` does the reverse mapping and feeds Immer's `applyPatches`. The integration test that round-trips through inverse patches passes — this is the load-bearing capability for the future `acture-undo`.

**Recommendation for Phase 2:**
- Pin the `Patch` op enum to `'add' | 'remove' | 'replace'` only for now. Don't add `'copy'`/`'move'` until a real caller asks. Immer does not produce them; only mobx-state-tree's `onPatch` does, and acture's undo design doesn't need them.
- Verify the RTK adapter's `subscribe` semantics match the contract; if RTK can pass `previous` via `store.subscribe(prev => …)`-style middleware, do so; otherwise document the limitation.

## 3. Was the when-clause DSL parser worth the complexity?

**LOC: 503 in `when.ts`** (including comments, AST types, the tokenizer, the recursive-descent parser, the evaluator, and three public-API helpers). The 200-LOC threshold in the reflection prompt was overshot.

**Where the LOC actually goes:**
- ~70 lines of comments/grammar documentation.
- ~180 lines of tokenizer (string/regex literals are the longest cases — escape handling).
- ~80 lines of parser.
- ~50 lines of evaluator + helpers.
- ~120 lines of public-API surface + types.

**Is it worth it?** Yes, on three grounds:

1. **Serializability to AI/MCP/external surfaces.** A DSL string can be projected into a tool description; a function escape hatch cannot. The function form is flagged "not exposable" so consumer projections can omit such commands or warn. If acture were function-only, **every** command with `when:` would be opaque to AI/MCP, defeating one of the eight consumer surfaces.
2. **Inspectable / debuggable predicates.** Phase 4's devtools UI can render the AST and the live evaluation. A function can only be displayed as `<function>`.
3. **Onboarding cost for command authors.** Writing `when: 'selection.length >= 1'` is shorter and clearer than `when: (ctx) => (ctx.selection?.length ?? 0) >= 1`.

**However, the LOC is high.** If Phase 2 / 3 grows the grammar (e.g., adding `>`/`<` after the locked operator review, or array literals as RHS of `in`), the hand-rolled parser will grow further. **At ~600 LOC I would reconsider a parser-combinator approach.** For Phase 1, hand-rolled with no dep was the right call.

**Recommendation for Phase 2 / 4:** Re-survey the locked operator set when implementing devtools. The bare-`>` rejection (the user-facing error says "use `>=`") may surprise authors. If three authors hit it, add `>` and `<` (this is an additive change, not breaking).

## 4. Did the second-agent test surface docs gaps?

**Yes — four gaps, none blocking.** The second agent succeeded but had to peek at `examples/greenfield/graph-editor/src/commands/index.ts` to learn the wiring pattern. Full verbatim list in `phase-1-acceptance.md` §4. Summarized:

1. **`buildCommands(state: StateAdapter)` factory pattern is undocumented.** Both the core README and the graph-editor README skip how the example wires state into the commands module. The agent expected either a module-level constant array or commands taking state via `ctx` — neither is right.
2. **Graph-editor state shape is undocumented.** A contributor adding a command that mutates state has to read `state.ts` to learn the field names.
3. **`noUncheckedIndexedAccess` is undocumented.** The core README's `renameNode` sketch shows `draft.nodes[id].label = …`, which the agent correctly noted would fail under acture's strict TS settings. The agent had to use an if-guarded form to get past the typecheck.
4. **`state.getState()` as the idiomatic read primitive is not called out** in the StateAdapter section.

**Action for Phase 2:**
- Add a "How to add a command (in this example)" section to the graph-editor README that names the factory pattern and shows the state shape with a code excerpt.
- Add a note in the core README's "Writing a new command — pattern" that real code typically closes over a `StateAdapter<S>` from a host module, and link to the example.
- Add a `noUncheckedIndexedAccess`-friendly version of the `renameNode` sketch.
- Add a "read with `getState()`, mutate with `setStateWithPatches`" one-liner.

**Recommendation:** make these doc additions a Phase 2 deliverable; **do not block Phase 1.**

## 5. Any "hard don't" violations?

Ran the merge checklist from `.claude/skills/acture-hard-donts/SKILL.md`. Going through them:

1. **No conditional logic in command metadata.** ✅ The `when` field is the upper bound; we did not grow callback variants à la Obsidian.
2. **No god-package.** ✅ Core has zero React, zero state-library, zero UI deps. The three packages (`acture`, `acture-state-zustand`, `acture-palette-react`) are tightly scoped.
3. **No business logic in adapter packages.** ✅ `acture-state-zustand` only translates between zustand+immer and the `StateAdapter<S>` contract. `acture-palette-react` only iterates the registry and renders cmdk items — even the parameterized-command "Phase 2 badge" is a rendering choice, not business logic.
4. **No `if (mode === ...)` in shared helpers.** ✅ Core has no mode awareness.
5. **No `eval()`-ing LLM strings.** ✅ The dispatcher takes `(id, args)` and uses `Map.get(id)`. No reflective call.
6. **No coupling the registry to React.** ✅ The `createRegistry` is plain TS. React lives only in `acture-palette-react` (its hook + JSX). The example's `useGraphState` is in the example, not in core.
7. **No promoting `@experimental` without a migration story.** N/A (no experimental→stable promotions yet).
8. **No bundling a UI kit.** ✅ `acture-palette-react` uses cmdk's headless primitives; styling is the host's job, demonstrated in the example with a small CSS file.
9. **No marketing on category.** ✅ READMEs lead with "One schema. Palette, hotkeys, AI tools, MCP, and tests — for free."
10. **No LLM-as-authorization.** ✅ Schema validation is at the dispatcher (`schema.safeParse(params)`) before `execute` runs.

**One borderline call:** `examples/greenfield/graph-editor/src/registry.ts` constructs the registry at module-load time and exports a singleton. This is fine for an example, but should not be promoted as the *recommended* pattern for production — there are cases (multi-window, hot-reload, server-rendered) where lazy construction is needed. The graph-editor README does not promote it as canonical; it just demonstrates a working setup.

## 6. Decisions to escalate to the user

**None blocking.** The four escalations from Phase 0's handoff doc were resolved at the start of this session via `AskUserQuestion`:

- Branching: Phase 0 committed to `main`, Phase 1 on `phase-1` branch (PR-style).
- Subpackage naming: `acture-<name>` scoped pattern (`acture-state-zustand`, `acture-palette-react`).
- Schema layer: Zod-only for Phase 1. Standard Schema acceptance lands in Phase 2 without breaking Zod authors (additive).
- When-clause parser: hand-rolled recursive descent. Confirmed in §3 above as the right call for Phase 1.

**Non-blocking observations the user may want to weigh in on later:**

1. **`patches`/`effects` reserved hooks survived Phase 1.** Phase 2 should not consume them; Phase 4+ may. If the user wants to push undo into v1.0 instead of post-v1, the hooks are ready. (Recommendation: stay on post-v1 trajectory; the rule-of-three hasn't fired.)
2. **The internal `app.dev.resetState` command is a pragmatic test affordance**, not a load-bearing pattern. Phase 3's migration package or Phase 4's devtools may want a more principled "snapshot/restore" mechanism. Not urgent.
3. **The `Patch.op` enum is currently `'add' | 'remove' | 'replace'`** — RFC 6902 also has `'copy'`, `'move'`, `'test'`. Immer doesn't produce them. Don't grow the enum until someone asks. (See also §2.)
4. **The graph-editor's palette overlay closes on parameterized-command select.** This is a Phase-2 stand-in. Phase 2 will replace it with the picker chain; the host doesn't need to change anything except register the new palette behavior.

---

## Phase 2 readiness gate

Per `docs/implementation_plan.md` §"Phase 2 — Adapter buildout" the next phase ships:

- `acture-hotkeys` (tinykeys)
- Extended `acture-palette-react` with parameterized command support (research-2 §9)
- `acture-forms-autoform` + `acture-forms-rjsf`
- `acture-state-redux` (RTK reference adapter)
- `acture-mcp` (MCP server adapter)
- `acture-ai-vercel` (Vercel AI SDK adapter)
- Extended worked examples + a new drop-in example

None of those are gated by a Phase 1 rethink. The CommandRecord shape, the StateAdapter contract, and the schema bridge are stable. **Phase 1 is DONE.**
