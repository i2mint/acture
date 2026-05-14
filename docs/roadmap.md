# acture roadmap & status tracker

The live forward-planning surface. `docs/v1_plan.md` and `docs/implementation_plan.md` are the *historical* v1 plan (phases 0–4, all complete); this file is what's true now and what's next.

**How work proceeds:** phases are over. Work is small, tracked increments. Each picks one or two items from "Next" or "Deferred", ships them, updates this file, and replaces `docs/next_session.md` with the following handoff.

Last updated: **2026-05-14** (v1.7 — macros + e2e testing tooling).

---

## Status snapshot

- **16 packages** in the workspace (15 published on npm 2026-05-14; **`acture-e2e-playwright`** new this increment, ships with the next release). Note: the MCP adapter ships as **`acture-mcp-server`** — the unscoped name `acture-mcp` was already taken by an unrelated project, so the package was renamed.
- **419 package tests + 41 example tests** green; all packages and examples build + typecheck. (+23 from `acture-e2e-playwright`.)
- Canonical positioning is now written down (`docs/positioning.md`) and wired into the skills.
- **17 skills**: 12 `acture-*` (dev / foundation / consumer-surface — including `acture-greenfield` and the new `acture-macros` + `acture-e2e` consumer skills) and 5 `migration-*`.
- Two reproducibility references: `docs/hand-written-registry.md` (the core primitive) and `docs/hand-written-command-sequence.md` (the record / compose / replay consumer layer).

---

## Done

### Phases 0–4 (the original v1 plan) — complete
Core, state adapters, all consumer adapter packages, the migration package + migration skill track, the tier system, CLI, devtools. See `docs/phase-*-reflection.md`.

### v1.1 – v1.4 increments — complete
DOM interception, RTK example, build-tier AST mode, deep schema diffs, the full research-4 §B.5 codemod set (5 codemods), `eslint-plugin-acture-migration` (`acture/no-stale-wrap-mutation`), and the deferred fresh-agent release-gate test. See `docs/v1_{1..4}-reflection.md` and `docs/fresh-agent-test-results.md`.

### v1.5 — repositioning + namespace migration — complete (this increment)
- **`docs/positioning.md`** written — canonical: acture is a development tool first, packages are an optional accelerator, the two flexibility dimensions (core vs strangler-fig; agent-written vs package-reuse), and the dev-tool-first principle (zero `acture-*` dependency unless explicitly chosen).
- **`acture-consumer-integration` skill** created — the foundational pattern for building a consumer in a target project. Dev skills (`acture-architecture-primer`, `acture-hard-donts`, `acture-palette-design`) updated to load it whenever a task touches a consumer surface; `acture-hard-donts` gained a positioning check (merge-ritual item #6).
- **Namespace migration** — all 13 `@acture/*` packages renamed to unscoped `acture-*` (the `@acture` npm scope was unavailable; flat naming also fits the "optional à-la-carte tools" positioning better). All imports, workspace deps, configs, examples, docs, and skills updated; lockfile regenerated; full workspace re-validated.
- **READMEs** — root, `packages/core`, and all 14 sub-package READMEs carry the dev-tool-first framing. `AGENTS.md` updated.

### npm publishing — complete
All 15 packages are live on npm (2026-05-14). The `@acture` org could not be created (namespace taken) → went unscoped `acture-*`. One further collision surfaced at publish time: the unscoped name `acture-mcp` was already taken by an unrelated project, so the MCP adapter was renamed to **`acture-mcp-server`**.

### v1.6 — core positioning-alignment review — complete (this increment)
Audit of `packages/core` against `docs/positioning.md`. Findings and outcome (full write-up: `docs/core-review-reflection.md`):

- **Import boundary: clean.** Core depends only on `zod` (peer). Zero React, zero state libraries — verified across all source files (hard-don'ts #6 holds).
- **Promise A (core is the minimal primitive): one extraction.** Seven of eight source files are genuinely primitive (registry/dispatcher, schema bridge, state-adapter interface; the `when` DSL is defensibly primitive — the dispatcher must evaluate the closed `when` field). The outlier was **`tier-warnings.ts`** — `enableTierWarnings` is dispatch *instrumentation* (it monkey-patches `registry.dispatch` to `console.warn`), structurally identical to `acture-devtools`'s `instrumentRegistry`. **Moved to `acture-devtools`.** `acture` core ↔ `acture-devtools` both `minor`.
- **Promise B (the agent-written path is reproducible): the central gap, now closed.** The skills taught acture's *design* and `acture-consumer-integration` covered the hand-written path for *consumers*, but nothing made the **core primitive itself** reproducible without reverse-engineering ~1000 lines of source. New artifacts: **`docs/hand-written-registry.md`** (a legible, ~80-line, zero-dependency registry+dispatcher reference) and the **`acture-greenfield` skill** (walks an agent through standing up the core primitive in a new project — hand-write vs. install `acture` core as a deliberate per-project choice). `acture-architecture-primer` updated to load `acture-greenfield` for greenfield tasks.
- `CommandRecord` unchanged — stays closed at 15 fields.

### v1.7 — macros + e2e testing tooling — complete (this increment)
The two least-tooled consumer surfaces — macros and e2e — built per the positioning. Full write-up: `docs/v1_7-reflection.md`.

- **Step 1 design decision (settled with the user via `AskUserQuestion`):** the shared command-sequence concept is **not** a package. The fork was (A) a shared `acture-sequence` substrate, (B) two independent packages, (C) a hand-written reference doc + only the tool-bound package. **Chose C.** Rule of three (no third concrete *code* caller of a substrate yet), hard-don't #2 (a substrate package layering macros + e2e + assertions courts god-packaging), and the journal's own "the macro layer is a thin consumer, not a new primitive" (§3.7) all pointed the same way — and it matches the v1.6 `docs/hand-written-registry.md` precedent exactly. Macros: **pattern + skill, no package** (also user-confirmed).
- **`docs/hand-written-command-sequence.md`** — the reproducible reference: `recordSequence` / `replaySequence` / `replayTest` over `{commandId, params}` sequences, ~60 lines a project owns outright. The sibling of `docs/hand-written-registry.md`.
- **`acture-e2e-playwright`** — the one new package (the *tool-bound* piece). Two layers kept separate: a pure, Playwright-free sequence engine that mirrors the reference doc line-for-line, and the Playwright glue (`dispatchInPage`, `clickCommand`, `commandSelector`, `replaySequenceInPage`, `replayTestInPage`, plus a `test` fixture at `acture-e2e-playwright/fixture`). Playwright is type-only in the main entry; the runtime import is isolated in `./fixture`. 23 tests. `minor` changeset.
- **`acture-macros` + `acture-e2e` consumer skills** — both build on `acture-consumer-integration`. `acture-macros` documents the no-package, hand-write-from-the-doc path; `acture-e2e` covers the test-pyramid compilation strategy, the Playwright package, and that Cypress / Vitest browser mode / other runners are equally valid (agent-written) choices.
- `acture-architecture-primer` and `acture-consumer-integration` updated: the eight-consumer-surface list and the per-tool table now reference the shipped macros/e2e artifacts instead of marking them "post-v1" / "planned".

---

## Next

**Pick the next increment from Deferred / backlog.** No item is pre-selected — the consumer-skill family is the natural continuation (hotkeys / MCP / AI / telemetry / undo / extensions still need per-surface consumer skills, now that the foundation + palette + macros + e2e skills exist), but the codemods README/CLI polish and the greenfield agent-track skills are equally valid picks. Choose one or two when this increment is scheduled.

---

## Deferred / backlog

Valid, not scheduled. Pick up when prioritized.

- **Codemods README/CLI polish** — from the v1.4 fresh-agent test (`docs/fresh-agent-test-results.md`): the README's `npx acture-codemods` invocation story, undocumented per-codemod `--option` keys, undocumented `--manifest`/`--files-from`, and the ambiguous "No files matched" error. Full candidate list parked in `docs/backlog/codemods-polish-and-tier-mirror.md`.
- **`.d.ts` mirror of resolved tier values** — optional `acture-build-tier` polish. Parked in the same backlog file.
- **AI-codemod-recipe doc** — research-4 recommendation #8: a doc showing how to prompt an agent to author a one-off codemod. Parked in the same backlog file.
- **Per-surface consumer skills** — `acture-consumer-integration` is the foundation; per-surface skills now exist for the palette (`acture-palette-design`), macros (`acture-macros`), and e2e (`acture-e2e`). Hotkeys, MCP, AI, telemetry, undo, extensions still need consumer skills — the natural next increment.
- **Greenfield agent-track skills** — the *foundation* now exists (`acture-greenfield` + `docs/hand-written-registry.md`, added v1.6). What's still missing: per-step greenfield skills below the foundation (state-model design walkthrough, a worked greenfield bootstrap). Lower priority now that the foundation is in place; build out as the consumer-skill family fills in.

---

## Post-v1 (deferred, not committed)

Per `docs/v1_plan.md` §"Post-v1" — none ship without explicit user direction **and** three concrete callers (rule of three):

- **`acture-undo`** — patch-based undo, transactions, effect queue. `Result<R>` already reserves `patches?` / `effects?`; `PatchCapableAdapter` is implemented by the state adapters.
- **`acture-telemetry`** — middleware logging every dispatch.
- **`acture-sandbox`** — membrane-pattern third-party extension sandboxing.
- **`acture-test-property`** — fast-check arbitraries derived from command param schemas; random command sequences asserting state invariants. (Now that v1.7 has landed: this would build *on* `acture-e2e-playwright`'s sequence engine — random `CommandSequence`s replayed via `replaySequence`, with invariant assertions — rather than re-deriving the sequence layer. Still rule-of-three gated.)
- **`acture-state-jotai`, `acture-state-valtio`** — additional reference `StateAdapter<S>` implementations.
- **Python companion** — **research-6 is done** (`docs/research/acture_research_6 …`) and gives this a tight, ready shape: a *thin MCP-client facade* package (`acture` on PyPI if available, else `acture-client`), ~300 LoC, dict-like in the `dol`/`py2mcp` idiom, zero hard Pydantic dependency. **The server side already ships** as `acture-mcp-server` — only the thin Python *client* remains. Explicitly **not** a Pydantic-codegen SDK or OpenAPI emitter in v1 (those are post-companion, for human — not agent — consumers). Still gated on the rule of three, but no longer blocked on research — pull forward whenever wanted. Note: research-6 was written against an assumed `StableCommand` name; map it to the real `CommandRecord` / `defineCommand`.

### Smaller items surfaced by research-6 (backlog)

- **`.describe()` discipline as a lint rule** — Zod→JSON-Schema is lossy (refinements, transforms, branded types are dropped), so a missing `.describe()` on a command param should be a lint error. Natural fit for a future `eslint-plugin-acture` schema-quality rule. Affects `acture-schema-bridge` quality and `acture-mcp-server` tool descriptions.
- **Pin the MCP spec version in CI** for `acture-mcp-server` — the spec is date-versioned and the transport story churns (SSE → streamable HTTP); treat protocol upgrades as semver-major.

---

## Tracking — open threads from recent discussion

Explicit done/not-done for everything raised in conversation, so nothing is lost:

| Thread | Status |
| --- | --- |
| `eslint-plugin-acture-migration` | ✅ Done (v1.4), published |
| Fresh-agent release-gate test | ✅ Done (v1.4) — `docs/fresh-agent-test-results.md` |
| Publish acture suite to npm | ✅ Done — all 15 live (2026-05-14); `acture-mcp` collided, shipped as `acture-mcp-server` |
| `@acture` npm org unavailable | ✅ Resolved — went unscoped `acture-*` (v1.5) |
| Canonical positioning written down | ✅ Done (v1.5) — `docs/positioning.md` |
| `acture-consumer-integration` skill + dev-skill wiring | ✅ Done (v1.5) |
| `@acture/*` → `acture-*` rename | ✅ Done (v1.5) |
| READMEs reflect dev-tool-first positioning | ✅ Done (v1.5) |
| `acture` core positioning-alignment review | ✅ Done (v1.6) — `tier-warnings` extracted to `acture-devtools`; `docs/hand-written-registry.md` + `acture-greenfield` skill added; see `docs/core-review-reflection.md` |
| Macros tooling | ✅ Done (v1.7) — pattern + skill (`acture-macros`), no package; `docs/hand-written-command-sequence.md` |
| e2e testing tooling (`acture-e2e-playwright`) | ✅ Done (v1.7) — package shipped; `acture-e2e` consumer skill; see `docs/v1_7-reflection.md` |
| Shared command-sequence substrate question | ✅ Resolved (v1.7) — settled with user: hand-written reference doc + one tool-bound package, no `acture-sequence` |
| Changeset spurious `2.0.0` major bump | ✅ Resolved (v1.7) — peer-dep ranges loosened to `^1.0.0` + `onlyUpdatePeerDependentsWhenOutOfRange` + `fixed` group dropped; see `docs/escalations.md` |
| Codemods README/CLI polish | ⏸️ Deferred — backlog |
| `.d.ts` tier mirror | ⏸️ Deferred — backlog |
| AI-codemod-recipe doc | ⏸️ Deferred — backlog |
| Per-surface consumer skills (hotkeys/mcp/ai/telemetry/undo/extensions) | ⏸️ Deferred — backlog |
| Greenfield agent-track skills | ⏸️ Deferred — backlog |
| `acture-test-property`, `state-jotai`, `state-valtio` | 🔒 Post-v1 |
| `acture-undo`, `acture-telemetry`, `acture-sandbox` | 🔒 Post-v1 |
| Research-6 (cross-language story) | ✅ Done — filed at `docs/research/acture_research_6 …` |
| Python companion | 🔓 Post-v1 but **unblocked & specified** — thin MCP-client facade; server side (`acture-mcp-server`) already ships |
| `.describe()` schema-lint rule, pin MCP spec version | ⏸️ Deferred — backlog (surfaced by research-6) |
