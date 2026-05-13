# Acture v1 — Research-Informed Plan

**Status:** RESEARCH-INFORMED — 2026-05-12. Successor to the wrapex `v1_plan.md` written before research was complete. Research findings 1–5 (at `docs/research/`) have been folded in; sections that were `🔬 RESEARCH-GATED` in the original are now concrete. Research finding 6 (cross-language TS↔Python) was not executed and the Python companion package remains explicitly post-v1.

**Reading order:** This plan assumes the reader has read [`command_dispatch_journal_article.md`](command_dispatch_journal_article.md), the five research findings under [`research/`](research/), and [`redesign_takeaways.md`](redesign_takeaways.md). It does not re-argue decisions already settled there.

**Companion document:** [`implementation_plan.md`](implementation_plan.md) breaks each phase below into agent-executable tasks with explicit pre-next-phase reflection checklists. This file says *what* and *why*; that file says *how*, *who*, and *when does the gate close*.

---

## 1. Settled decisions

These are now-locked commitments from the user, the takeaways doc, and the five research findings. Deviation requires a documented rationale, not a casual reversal.

| Question | Decision | Source |
| --- | --- | --- |
| Library name | **`acture`** on both npm and PyPI. Both available, both reserved this session. | User; verified 2026-05-12 |
| Target purity is a library-level concern? | No — same core serves all three positioning paths (greenfield, strangler-fig, footprint-minimizer); differences live in adapters and docs. | Takeaways §0 |
| `when`-clauses: DSL or function? | **Both.** Small VS Code-style DSL primary; `(ctx) => boolean` allowed as escape hatch (flagged "not exposable to AI/MCP"). | User |
| State management library | **Agnostic, with happy path.** Thin three-method `StateAdapter<S>` interface (`getState` / `setState(updater)` / `subscribe(listener)`) plus optional `PatchCapableAdapter<S>` sub-interface for the future undo subsystem. Ship **`acture/state-zustand`** in Phase 1 as the documented default. RTK adapter follows in Phase 2. | Research-3 + user |
| Migration package | Real package (`acture/migration`), four functions: `wrapMutation`, `actureMiddleware`, `chooseImplementation`, `shadowCompare`. `divertHandler` from the original wrapex sketch is **dropped**. DOM-event interception deferred to v1.1. Codemods (`acture/codemods`) deferred to v1.1. | Research-4 + user |
| Undo subsystem | **Post-v1.** Reserve `execute` return shape (`Result<R>` with optional `patches?` and `effects?`) so adding `@acture/undo` later is non-breaking. | User |
| Schema as SSOT | JSON Schema as wire format; Zod is recommended authoring layer; Standard Schema accepted at boundary. Keep command param schemas in the JSON-Schema-representable subset (no `z.transform`, `z.date`, `z.bigint`, `z.set`, `z.map`, `z.custom` in params; validate at registration time). | Takeaways §1.3 + research-5 |
| Single dispatch entry point | `dispatch(id, args, ctx?)` for all surfaces. Performance carve-out: render-frequency operations stay as direct function calls. | Takeaways §1.4 |
| Owner-scoped lifecycle | **Disposable pattern.** Every `register*` returns a disposable. | Takeaways §1.5 |
| Errors as data | Discriminated-union `Result<R>`; no thrown exceptions across consumer boundaries. | Takeaways §1.8 |
| Keybindings | **First-class field on `CommandRecord`** (research-1's missing-convergent-field finding). Shape: `string | string[]` using the tinykeys DSL (`"$mod+K"`, `"g i"`, `"$mod+([0-9])"`). Documented as a *suggestion* the user can override. | Research-1 + takeaways §1.7 |
| Sandboxing | Not in v1. Trusted-extension model; add membrane later if a real third-party ecosystem emerges. | Takeaways §2.6 |
| Atomic vs. handoff | First-class `kind: "atomic" \| "handoff"` field on `CommandRecord`, **auto-derived** from schema heuristic (param count ≤ 2 AND all params have constrained pickers → `atomic`; otherwise → `handoff`), author-overridable. | Research-2 §9.2 |
| Tier system | JSDoc tag (`@stable` / `@experimental` / `@internal` / `@deprecated`) + mirrored `tier` metadata field. Per-tier opt-in (not per-feature). Runtime gating: `@stable` is the default for all external surfaces; `@experimental` requires explicit `tiers: ['stable', 'experimental']`; `@internal` never exposed; `@deprecated` stays one minor release with banner prefix. | Research-5 §7 |
| Description changes | **MAJOR by default** in `acture compare-schemas`, with explicit `--allow-description-edits` to downgrade per-invocation (not a config file setting). | Research-5 §6.2 |

---

## 2. Three positioning paths

These are not three libraries. They are three documented adoption journeys over the same core.

1. **Greenfield-pure** — "Starting from scratch? Design your app command-dispatch-first." Greenfield users install `acture` + `acture/state-zustand` + the consumer adapters they want (`acture/palette-react`, `acture/mcp`, `acture/ai-vercel`). They never install `acture/migration`.
2. **Strangler-fig migration** — "Have an existing app? Use Claude Code with `acture/migration` to incrementally introduce command dispatch." These users install `acture` + `acture/migration` + their existing state lib's adapter. Over months they retire `acture/migration` (graduation).
3. **Footprint-minimizer drop-in** — "Just want a command palette + MCP server bolted onto your existing app? 5-minute drop-in." These users install `acture` + `acture/palette-react` + `acture/mcp` + minimal use of `acture/migration` (`wrapMutation` only). They never migrate further.

**The library that serves all three is the same registry, dispatcher, and schema bridge** — only the surrounding adapter packages and documentation paths differ. No mode-aware conditionals inside the core.

---

## 3. Package layout

```
acture                    # Default barrel = core + most-used adapters re-exported (kept thin).
acture/core               # Registry, dispatch, schemas, when-clause DSL, owner lifecycle.
                          # ZERO React/UI/framework deps. ZERO bundled state lib.
acture/state-zustand      # StateAdapter implementation for zustand + zustand/middleware/immer.
                          # PHASE 1 — the documented default.
acture/state-redux        # StateAdapter implementation for Redux Toolkit. PHASE 2.
acture/palette-react      # cmdk-based default palette UI. PHASE 1 (param-free) → PHASE 2 (parameterized).
acture/hotkeys            # tinykeys binding. Plain DOM, optional React hook. PHASE 2.
acture/forms-autoform     # Zod → form (autoform). PHASE 2. Optional.
acture/forms-rjsf         # JSON Schema → form (rjsf). PHASE 2. Optional.
acture/ai-vercel          # Adapter to Vercel AI SDK tools. PHASE 2.
acture/mcp                # Adapter to MCP TS SDK (server + client). PHASE 2.
acture/migration          # wrapMutation, actureMiddleware, chooseImplementation,
                          # shadowCompare. PHASE 3.
acture/devtools           # Inspector: registry, dispatch log, when-clause evaluator. PHASE 4.

# Deferred (post-v1, not committed):
acture/codemods           # Five codemods per research-4 §B.5. v1.1.
acture/undo               # Patch-based undo. Hooks reserved in Phase 1.
acture/macros             # Record/replay.
acture/telemetry          # Logging middleware.
acture/test-property      # fast-check arbitraries.
acture/state-jotai        # Jotai adapter.
acture/state-valtio       # Valtio adapter.
acture-py                 # Python companion package (research-6 not executed).
```

**Core invariant:** `acture/core` has **zero** React, UI, framework, or state-library dependencies. It is a plain TypeScript library callable from any host environment.

---

## 4. The Command Record (closed surface)

```ts
type CommandRecord<P = unknown, R = unknown> = {
  /** Stable namespaced ID. Convention: 'app.domain.action' (verb-noun). */
  id: string;

  /** Human-readable label for palette, menus, tooltips. */
  title: string;

  /** One-sentence description. Doubles as the LLM-facing tool description.
   *  Reminder: descriptions are MAJOR semver-impacting per research-5. */
  description?: string;

  /** Discovery aid. Optional. Palettes group by this. Not part of dispatch semantics. */
  category?: string;

  /** Discovery aid. Optional. */
  icon?: string;

  /** Parameter schema. Authoring forms accepted at boundary:
   *  Zod (default), JSON Schema as const, Valibot. Registry normalizes to JSON Schema. */
  params?: StandardSchema<P>;

  /** Availability predicate. DSL string OR `(ctx) => boolean`.
   *  Function escape hatch is flagged "not exposable to AI/MCP". */
  when?: string | ((ctx: Context) => boolean);

  /** Keybinding(s) as tinykeys DSL strings. First-class per research-1. */
  keybinding?: string | string[];

  /** Search aliases. Optional. */
  aliases?: string[];

  /** Atomic vs. handoff (research-2). Auto-derived if omitted; override here when needed. */
  kind?: "atomic" | "handoff";

  /** Tier (research-5). Authoritative source is the JSDoc tag; this field is the
   *  build-step mirror so the runtime can read it without parsing JSDoc. */
  tier?: "stable" | "experimental" | "internal" | "deprecated";

  /** Default match score in palette ranking. Optional. */
  defaultScore?: number | ((ctx: Context) => number);

  /** Suggested follow-up commands. For palette hints, not for chaining. Optional. */
  follow?: string[];

  /** The handler. */
  execute: (params: P, ctx: Context) => Result<R> | Promise<Result<R>>;
};

type Result<R> =
  | { ok: true; value: R; patches?: Patch[]; effects?: Effect[] }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

`patches?` and `effects?` are **reserved hooks for `@acture/undo`** (post-v1). v1 core ignores them. They are present so adding undo later is non-breaking.

**The metadata surface is closed.** No new fields without three real consumers asking. Compose new capabilities via wrapper functions (`palettable(cmd, ...)`, `toolCallable(cmd, ...)`).

**Fields the wrapex implementation had that are NOT in this record** (audit-of-record):
- `inputComponent?: unknown` — removed. UI components live in palette adapter config, not on commands.
- `metadata: PolicyMetadata` (with `readOnly`, `idempotent`, `riskLevel`, `requiresConfirmation`) — removed as a single bag. `readOnly` and `requiresConfirmation` if needed are added as top-level optional fields by composition only when three callers ask. `riskLevel` and `idempotent` reduce to query-vs-mutation classification (the `kind` field already captures part; the rest is middleware concern).
- `tags?: string[]` — removed in favor of `category` + `tier` covering the use cases.
- `isVisible?` and `isEnabled?` callbacks — removed; folded into `when` (with the function escape hatch).
- `requiresConfirmation` at top level — removed. Confirmation is a middleware concern, gated by `kind` and tier, not a per-command boolean.

---

## 5. Phased delivery

This section names the phases. **Each phase is a gate, not a waypoint.** [`implementation_plan.md`](implementation_plan.md) specifies the per-phase deliverables, acceptance tests, and pre-next-phase reflection checklist.

### Phase 0 — Scaffold and naming (preparation)

**Status:** ✅ DONE — 2026-05-13. See [`phase-0-reflection.md`](phase-0-reflection.md).

**Goal:** acture exists as a publishable monorepo with both names reserved.

- Reserve `acture` on npm (v0.0.0 stub) and `acture` on PyPI (v0.0.0 stub).
- Scaffold a TypeScript monorepo at `/Users/thorwhalen/Dropbox/py/proj/tt/acture/`: `packages/core/`, `packages/state-zustand/`, etc.
- Set up tooling: `tsconfig.json`, `vitest`, `tsup`/`tshy` for build, basic CI.
- README with three-path positioning headline.
- Docs migrated and consistent (this session).
- Skills directory `acture/.claude/skills/` populated (this session).

**Acceptance:** `npm pack` succeeds; `pip wheel .` succeeds; CI green on empty package.

### Phase 1 — Minimal v0 core (research-independent)

**Status:** ✅ DONE — 2026-05-13. See [`phase-1-reflection.md`](phase-1-reflection.md) and [`phase-1-acceptance.md`](phase-1-acceptance.md).

**Goal:** A working `acture/core` validated end-to-end against a worked example with one consumer adapter.

Scope:
- `acture/core`: registry, `defineCommand`, `dispatch`, when-clause DSL parser/evaluator (operators: `!`, `&&`, `||`, `==`, `!=`, `>=`, `<=`, `=~`, `in`, `not in`), context-key store, `StateAdapter<S>` interface (no default implementation in core), owner-scoped disposables, `commandsChanged` event, schema bridge (`toJsonSchema`, `toMcpTool`), `Result<R>` type with reserved undo hooks.
- `acture/state-zustand`: production reference adapter, ~50 LOC including tests.
- `acture/palette-react`: minimal version, parameter-free commands only.
- Worked example `examples/greenfield/graph-editor/`: 6-8 commands (addNode, removeNode, connectNodes, deleteEdge, zoomToFit, selectAll, undo-placeholder).
- Property-based test scaffolding (fast-check) for registry invariants.

**Deferred to Phase 2:** parameterized palette UI, hotkeys, AI/MCP adapters, RTK adapter, forms, migration package.

**Acceptance:** The graph editor uses no `setState` outside `execute` handlers. A second agent, given only API docs, writes a 7th command without reading source. Property tests pass. `JSON.stringify(adapter.getState())` round-trip test passes.

### Phase 2 — Adapter buildout (consumer surfaces)

**Status:** ✅ DONE — 2026-05-13. Reflection: [`docs/phase-2-reflection.md`](phase-2-reflection.md).

**Goal:** Ship the adapters that make acture useful across all three positioning paths.

Scope:
- `acture/hotkeys` — tinykeys integration.
- `acture/palette-react` — extended with parameterized-command support per research-2 §9 (auto-derived `kind`, picker chain for `atomic`, modal hand-off for `handoff`).
- `acture/forms-autoform` and `acture/forms-rjsf` — both adapter packages, per redesign-takeaways §2.3.
- `acture/state-redux` — RTK reference adapter.
- `acture/mcp` — server adapter, registry → MCP tools, errors-as-data.
- `acture/ai-vercel` — registry → Vercel AI SDK tools.

**Acceptance:** Both worked examples (greenfield + drop-in) run. MCP client lists and calls commands from the greenfield example. An LLM (Claude or GPT-4) invokes commands via the Vercel AI adapter. Phase 2 reflection answers research-2's parameter-count cliff with empirical data from the worked example.

### Phase 3 — Migration package and skills

**Status:** ✅ DONE — 2026-05-13. Reflection: [`docs/phase-3-reflection.md`](phase-3-reflection.md). `@acture/migration` ships with 36 unit tests; the `examples/migration/zustand-wrap/` before/after pair demonstrates the strangler-fig path end-to-end.

**Goal:** Ship `acture/migration` plus the agent skills that use it.

Scope:
- `acture/migration` per research-4 §A.6:
  - `wrapMutation(handler, options?)` — load-bearing primitive. Wrap an existing handler as a command without changing it.
  - `actureMiddleware` — Redux/Zustand-compatible store-event interception middleware.
  - `chooseImplementation(pick, impls)` — thin 5-line helper for legacy/modern routing. Composes with any feature-flag SDK.
  - `shadowCompare(modern, legacy, options?)` — Scientist-style comparison wrapper.
- `acture/.claude/skills/` migration-track skills (rewritten from wrapex 01-04 against acture's actual API): `migration-diagnose`, `migration-plan`, `migration-scaffold`, `migration-wrap`. Plus `migration-graduate` for retiring transitional adapters.
- Worked example `examples/migration/` with a small existing-React-app fixture.

**Deferred to v1.1 per research-4:** `acture/codemods`, DOM-event interception.

**Acceptance:** Given the fixture app, an agent following the migration skills introduces acture and has at least 5 commands working without breaking existing behavior. Graduation skill cleanly retires `wrapMutation` calls.

### Phase 4 — Stability, tier system, devtools

**Goal:** Move from "works" to "production-ready."

Scope per research-5:
- API tier system: JSDoc tags + build-step metadata mirror; runtime gating with `tiers: [...]` opt-in.
- `acture compare-schemas` CLI per research-5 §6: full-surface diff (descriptions MAJOR by default with `--allow-description-edits` per-invocation), tier-aware, JSON output for machines, colored text for humans.
- `acture/devtools`: inspector UI for the registry, dispatch log, when-clause evaluator state.
- Hardening: error messages, edge cases, JSDoc.
- v1.0 release.

### Post-v1 (deferred, not committed)

None of these ship until three real callers ask:
- `acture/codemods` — per research-4 §B.5, v1.1.
- DOM-event interception middleware — per research-4 §A.5, v1.1.
- `acture/undo` — patch-based undo, transactions, effect queue. Hooks reserved in Phase 1.
- `acture/macros` — record/replay of command sequences.
- `acture/telemetry` — middleware for logging every dispatch.
- `acture/sandbox` — membrane-pattern third-party extension sandboxing.
- `acture/test-property` — fast-check property tests derived from command schemas.
- `acture/state-jotai`, `acture/state-valtio` — additional state adapters.
- Python companion package (`acture-py` on PyPI) — research-6 not executed.

---

## 6. Cross-cutting workstreams (acknowledged, not specified here)

- **Agent rails** (ESLint rules enforcing hard "don'ts" from redesign-takeaways §3; auto-loaded architecture doc; PR-size guidance; property-test scaffolding). To be specified as a separate workstream after Phase 1 lands.
- **Trunk-based development discipline** [ref_25]: small PRs, feature flags for in-progress work, fast builds.
- **Skills directory consistency**: every skill references `acture` (not `wrapex`), and fits cleanly into either the greenfield track, the migration track, or the universal pool.

---

## 7. Open questions (not blocking v1)

These are honest unknowns. None block Phase 0 or Phase 1.

| Open question | Best-current answer | When to revisit |
| --- | --- | --- |
| Will `acture compare-schemas` be ready to gate the v1 release in Phase 4? | Yes per research-5, but the diff tool is unprecedented; expect schedule slip. | End of Phase 3 |
| Will the auto-derived `kind` heuristic match user expectations? | Per research-2 the cliff is at 3 free-text params or 4+ pickers. Override flag is the safety valve. | After first 5 third-party users |
| Will the JSDoc-tag-plus-mirror tier system survive the agent-write workflow? | JSDoc survives `.d.ts`, agents can read it; the build-step mirror is one esbuild plugin. Untested at scale. | End of Phase 4 |
| Should `acture/migration` ship `chooseImplementation` and `shadowCompare` in v1, or wait? | Yes ship per user direction. Three callers will reveal whether they justify the surface. | After three migrations done with v1 |
| Will research-3's StateAdapter<S> interface stretch to cover Jotai/Valtio? | Probably yes per research-3 §3 (subscribe shape converges); patches are the loose end. | When the first such adapter is asked for |
| Cross-language story | Research-6 not executed. Python companion is post-v1. | Re-run research-6 before considering it. |

---

## 8. Why this plan is conservative

1. **Phase 1 is the only phase that requires nothing further to start.** Everything in Phase 1 is grounded in convergent evidence from research 1, 2, 3 plus the central paper.
2. **Phase 2, 3, 4 each have explicit acceptance criteria** that gate progression. No blind phase progression.
3. **Every package in §3 has a justification path back to a settled decision or a specific research finding.** No speculative packages.
4. **The deepest commitment is the command record shape (§4) and the dispatcher signature.** Both are research-1-validated. Everything else is amendable without breaking Phase 1's worked example.

---

## 9. Differences from the original wrapex `v1_plan.md`

Quick changelog for the reader who knew the previous plan:

- ✅ **Name** is no longer an option — `acture` is locked, both registries reserved.
- ✅ **State adapter interface** is now concrete (research-3): three-method `StateAdapter<S>` plus optional `PatchCapableAdapter<S>`.
- ✅ **Phase 1 ships zustand only** (smaller bet than research-3's recommendation of both zustand+RTK; per user direction).
- ✅ **CommandRecord** now includes `keybinding` as a first-class field (research-1's convergent missing field), `kind: "atomic" \| "handoff"` (research-2), and `tier` (research-5).
- ✅ **Migration package shape** is fixed per research-4 §A.6: four functions, `divertHandler` dropped.
- ✅ **Codemods** confirmed deferred to v1.1 per research-4 §B.1.
- ✅ **Tier system** is fully specified per research-5 §7 (JSDoc-tag-plus-mirror, per-tier opt-in).
- ✅ **Schema versioning CLI** committed to Phase 4 per research-5 §6.
- ✅ **Description changes** locked as MAJOR-by-default per research-5 §6.2.
- ⏸ **Research-6 (cross-language)** not executed; Python companion package remains explicitly deferred to post-v1.
