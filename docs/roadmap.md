# acture roadmap & status tracker

The live forward-planning surface. `docs/v1_plan.md` and `docs/implementation_plan.md` are the *historical* v1 plan (phases 0–4, all complete); this file is what's true now and what's next.

**How work proceeds:** phases are over. Work is small, tracked increments. Each picks one or two items from "Next" or "Deferred", ships them, updates this file, and replaces `docs/next_session.md` with the following handoff.

Last updated: **2026-05-15** (v1.10 — `.describe()` schema-quality lint rule + MCP spec-version pin).

---

## Status snapshot

- **16 packages** in the workspace. `acture-codemods@1.2.0` published (v1.9 CLI polish, 2026-05-15); `acture-e2e-playwright` still ships with the next release. Two pending changesets this increment: `eslint-plugin-acture-migration` `minor` and `acture-mcp-server` `patch`. Note: the MCP adapter ships as **`acture-mcp-server`** — the unscoped name `acture-mcp` was already taken by an unrelated project, so the package was renamed.
- **441 package tests + 41 example tests** green; all packages and examples build + typecheck. (+19 from the new `acture/require-param-describe` rule's tests, +2 from the MCP spec-version pin tests.)
- Canonical positioning is now written down (`docs/positioning.md`) and wired into the skills.
- **22 skills**: 17 `acture-*` (dev / foundation / consumer-surface — including `acture-greenfield` + its two new agent-track sub-skills `acture-greenfield-state-model` and `acture-greenfield-bootstrap`, the `acture-macros` + `acture-e2e` consumer skills, and the `acture-hotkeys` + `acture-mcp` + `acture-ai` consumer skills) and 5 `migration-*`.
- Three reproducibility / recipe docs: `docs/hand-written-registry.md` (the core primitive), `docs/hand-written-command-sequence.md` (the record / compose / replay consumer layer), and `docs/ai-codemod-recipe.md` (authoring a one-off codemod).

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

### v1.8 — hotkeys / MCP / AI consumer skills — complete (this increment)
Three per-surface consumer skills, for the three remaining consumer surfaces that already have shipping packages. Full write-up: `docs/v1_8-reflection.md`.

- **Step 1 decision (settled with the user via `AskUserQuestion`):** picked **per-surface consumer skills** over codemods polish / greenfield agent-track skills, scoped to **hotkeys + MCP + AI** — the three surfaces with shipping packages (`acture-hotkeys`, `acture-mcp-server`, `acture-ai-vercel`). telemetry / undo / extensions were deferred: no shipping packages yet (telemetry & undo are post-v1), so their skills would be agent-written-path-only and less consistent — a later increment.
- **`acture-hotkeys` skill** — keyboard shortcuts as a registry projection. The tool-library choice (tinykeys / react-hotkeys-hook / custom), agent-written vs the `acture-hotkeys` package, first-registered-wins conflict resolution, fire-time `when`-clause evaluation, the input-aware default, modal scoping.
- **`acture-mcp` skill** — the registry as an MCP server. The two-layer split (pure projection vs transport glue), the SDK/transport choice, tier semantics, the deterministic `@deprecated` banner, function-`when` exclusion, errors-as-data, and the prompt-injection guardrails (hard-don'ts #5/#10).
- **`acture-ai` skill** — the registry as LLM tool definitions. The SDK choice and the schema-projection fork (pass Zod through vs project to JSON Schema), errors-as-data, function-`when` exclusion, the prompt-injection guardrails, and the "an AI tool-call sequence is a macro" cross-reference.
- All three build on `acture-consumer-integration`, follow the `acture-macros` / `acture-e2e` template for shape and tone, and document both the agent-written and package-reuse paths with the tool-library choice framed as the user's.
- **Consistency updates:** `acture-architecture-primer`'s consumer-surface list and `acture-consumer-integration`'s "See also" now point at the new skills.
- Skills + docs only — no package code changed, no changeset. Full workspace build / typecheck / test re-verified green.

### v1.9 — codemods polish + greenfield agent-track skills — complete (this increment)
Two backlog increments shipped in one session (the user delegated the scope call: "fix what's fixable autonomously"). Full write-up: `docs/v1_9-reflection.md`.

**Part A — codemods README/CLI polish + AI-codemod-recipe doc** (closes the `docs/backlog/codemods-polish-and-tier-mirror.md` file):
- **`acture-codemods` CLI** — the ambiguous "No files matched" error (v1.4 fresh-agent finding #4) is now three distinct messages: no `--target`/`--files-from` given, a path that does not exist (likely a typo), a path with no `.ts`/`.tsx`/`.jsx` files. `--help` gained Modes (`--list`/`--manifest`) and Exit codes sections. +3 CLI tests (52 → 55). `minor` changeset.
- **`acture-codemods` README** — rewritten: documents every `--option` key for all five codemods, `--manifest` vs `--list`, `--files-from`, exit codes, and the from-a-clone invocation. (Finding #1 — the `npx` 404 — was resolved by reality: `acture-codemods` is published on npm; the README now states that and adds the contributor invocation.)
- **`docs/ai-codemod-recipe.md`** — research-4 recommendation #8: the `Codemod` contract, the four-point conservative-codemod discipline, a ts-morph `run` skeleton, a prompt recipe, and how to run a one-off codemod (throwaway script vs. drop into the package).
- **`.d.ts` tier mirror — deliberately NOT built.** Deferred v1.2 → v1.8 with no concrete consumer; tier filtering is runtime-only (`registry.list({ tiers })`), nothing consumes tier at the type level. Building it would be speculative infrastructure without a named need. Instead, the `acture-build-tier` README caveat was rewritten to make the deferral explicit-with-rationale.
- **`.changeset/README.md`** — fixed: it still described the dropped `fixed` group and the stale "0.x quirk". Now describes independent versioning and post-1.0 semver.

**Part B — greenfield agent-track skills** (the per-step skills below the `acture-greenfield` foundation):
- **`acture-greenfield-state-model`** — Step 1 in detail: the four hard constraints on the state shape (JSON-serializable, typed slices, normalized, stored-vs-derived), the deterministic counter-in-state id-generation pattern, the `StateAdapter` seam, what does NOT belong in state.
- **`acture-greenfield-bootstrap`** — the concrete file-by-file walk-through of the foundation's four-step sequence, grounded in the `examples/greenfield/graph-editor` worked app: the three core files (`state.ts` → `registry.ts` → `commands/index.ts`), the "every mutation through dispatch" acceptance criterion + its `rg` audit, the ordering discipline, the recurring hand-write-vs-install decision points.
- **Consistency update:** `acture-greenfield` now points at both sub-skills (intro + Step 1 + See also).

### v1.10 — `.describe()` schema-quality lint rule + MCP spec-version pin — complete (this increment)
Two small, autonomous backlog items surfaced by research-6 (the user picked "smaller backlog items" over pulling a post-v1 item forward). Full write-up: `docs/v1_10-reflection.md`.

- **`acture/require-param-describe`** (new ESLint rule in `eslint-plugin-acture-migration`) — flags top-level fields in a `defineCommand({ params: z.object({...}) })` schema whose value expression has no `.describe(...)` in its method chain. Zod → JSON Schema is lossy; without `.describe()` every downstream consumer (MCP tool inputs, AI function-calling tool args, autoform / rjsf form adapters) is left with a parameter that has no semantic hint. Conservative detection (tracks the `defineCommand` and `z` bindings, only fires when both are recognised and `params` is structurally `z.object({...})`). +19 tests. `minor` changeset. The plugin now hosts both migration-specific and schema-quality rules; the historical `-migration` package suffix was kept to avoid a breaking rename (a god-package-of-one new plugin would have been speculative infrastructure — hard-don't #2).
- **MCP spec-version pin** (`packages/mcp/src/spec-version.test.ts`) — pins `EXPECTED_PROTOCOL_VERSION = '2025-11-25'` and asserts the SDK's `LATEST_PROTOCOL_VERSION` matches and `SUPPORTED_PROTOCOL_VERSIONS` still contains the older dates we interoperate with. When the SDK ships a new spec date the test fails, surfacing the upgrade as the deliberate, semver-major decision the roadmap calls for rather than an accidental transitive-dep pickup. README documents the policy + the test's upgrade checklist. +2 tests. `patch` changeset on `acture-mcp-server`.

---

## Next

**v1.11 — settled with the user on 2026-05-15:** pull two post-v1 items forward — **`acture-telemetry`** first (smaller; reuses `acture-devtools`'s `instrumentRegistry` hook), then **`acture-undo`** (larger; consumes `PatchCapableAdapter`, both state adapters already implement it). Full scope and the per-item shape decisions to surface with the user before locking in are in `docs/next_session.md`. Each item ships as a new package with a `docs/hand-written-*.md` reference doc and a consumer skill (the dev-tool-first promise is non-negotiable).

---

## Deferred / backlog

Valid, not scheduled. Pick up when prioritized.

- **`.d.ts` mirror of resolved tier values** — ⏸️ **deliberately deferred, not just unscheduled.** Considered in v1.9 and explicitly not built: zero concrete callers, tier filtering is runtime-only, nothing consumes tier at the type level. Rule-of-three gated — waits for a concrete type-level tier consumer. The `acture-build-tier` README documents the deferral and its rationale.
- **Per-surface consumer skills** — `acture-consumer-integration` is the foundation; per-surface skills now exist for the palette (`acture-palette-design`), macros (`acture-macros`), e2e (`acture-e2e`), hotkeys (`acture-hotkeys`), MCP (`acture-mcp`), and AI tool calling (`acture-ai`). Still missing: **telemetry, undo, extensions** — but these have no shipping packages (telemetry & undo are post-v1; v1.11 pulls those forward), so their skills are best written after the packages exist. Revisit once v1.11 ships.
- **Deeper greenfield agent-track skills** — the foundation (`acture-greenfield`) plus the two agent-track sub-skills (`acture-greenfield-state-model`, `acture-greenfield-bootstrap`, added v1.9) now cover the greenfield sequence end-to-end. No specific gap is scheduled; add further sub-skills only if practice surfaces one.

---

## Post-v1 (deferred, not committed)

Per `docs/v1_plan.md` §"Post-v1" — none ship without explicit user direction. (Earlier drafts of this section gated post-v1 promotion on a "three concrete callers" rule of three; that was a misapplication — see `docs/redesign_takeaways.md` §6. Post-v1 items pull forward on user direction plus the standard maintainer principles: hard-don't #2, dev-tool-first, single accelerators.)

- **`acture-undo`** — patch-based undo, transactions, effect queue. `Result<R>` already reserves `patches?` / `effects?`; `PatchCapableAdapter` is implemented by the state adapters.
- **`acture-telemetry`** — middleware logging every dispatch.
- **`acture-sandbox`** — membrane-pattern third-party extension sandboxing.
- **`acture-test-property`** — fast-check arbitraries derived from command param schemas; random command sequences asserting state invariants. (Now that v1.7 has landed: this would build *on* `acture-e2e-playwright`'s sequence engine — random `CommandSequence`s replayed via `replaySequence`, with invariant assertions — rather than re-deriving the sequence layer. Still deferred — pull forward on user direction.)
- **`acture-state-jotai`, `acture-state-valtio`** — additional reference `StateAdapter<S>` implementations.
- **Python companion** — **research-6 is done** (`docs/research/acture_research_6 …`) and gives this a tight, ready shape: a *thin MCP-client facade* package (`acture` on PyPI if available, else `acture-client`), ~300 LoC, dict-like in the `dol`/`py2mcp` idiom, zero hard Pydantic dependency. **The server side already ships** as `acture-mcp-server` — only the thin Python *client* remains. Explicitly **not** a Pydantic-codegen SDK or OpenAPI emitter in v1 (those are post-companion, for human — not agent — consumers). No longer blocked on research — pull forward whenever wanted. Note: research-6 was written against an assumed `StableCommand` name; map it to the real `CommandRecord` / `defineCommand`.

### Smaller items surfaced by research-6 — both now shipped

Both items below were picked up in v1.10:

- **`.describe()` discipline as a lint rule** — ✅ Shipped as `acture/require-param-describe` in `eslint-plugin-acture-migration`. The plugin's name kept its historical `-migration` suffix (renaming an already-published package is breaking; creating a new one-rule plugin would have been a god-package-of-one — hard-don't #2).
- **Pin the MCP spec version in CI** — ✅ Shipped as a `vitest` test in `packages/mcp/src/spec-version.test.ts` that asserts the SDK's `LATEST_PROTOCOL_VERSION` matches `EXPECTED_PROTOCOL_VERSION = '2025-11-25'`. An SDK upgrade that bumps the spec date now surfaces as a deliberate, semver-major decision.

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
| Codemods README/CLI polish | ✅ Done (v1.9) — CLI error disambiguation + full README rewrite; `minor` changeset on `acture-codemods`; see `docs/v1_9-reflection.md` |
| AI-codemod-recipe doc | ✅ Done (v1.9) — `docs/ai-codemod-recipe.md` |
| `.d.ts` tier mirror | ⏸️ Deferred (v1.9 decision) — explicitly not built: no type-level tier consumer; rationale in the `acture-build-tier` README |
| `.changeset/README.md` stale (`fixed` group, 0.x quirk) | ✅ Fixed (v1.9) — now describes independent versioning + post-1.0 semver |
| Per-surface consumer skills — hotkeys / MCP / AI | ✅ Done (v1.8) — `acture-hotkeys`, `acture-mcp`, `acture-ai`; see `docs/v1_8-reflection.md` |
| Per-surface consumer skills — telemetry / undo / extensions | ⏸️ Deferred — no shipping packages yet (post-v1); skills would be agent-written-path-only |
| Greenfield agent-track skills | ✅ Done (v1.9) — `acture-greenfield-state-model` + `acture-greenfield-bootstrap` below the foundation; see `docs/v1_9-reflection.md` |
| `.describe()` schema-lint rule | ✅ Done (v1.10) — `acture/require-param-describe` in `eslint-plugin-acture-migration`; `minor` changeset; see `docs/v1_10-reflection.md` |
| Pin MCP spec version | ✅ Done (v1.10) — `packages/mcp/src/spec-version.test.ts` pins `2025-11-25`; `patch` changeset on `acture-mcp-server`; see `docs/v1_10-reflection.md` |
| `acture-test-property`, `state-jotai`, `state-valtio` | 🔒 Post-v1 |
| `acture-undo`, `acture-telemetry`, `acture-sandbox` | 🔒 Post-v1 |
| Research-6 (cross-language story) | ✅ Done — filed at `docs/research/acture_research_6 …` |
| Python companion | 🔓 Post-v1 but **unblocked & specified** — thin MCP-client facade; server side (`acture-mcp-server`) already ships |
