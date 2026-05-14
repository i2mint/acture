# acture roadmap & status tracker

The live forward-planning surface. `docs/v1_plan.md` and `docs/implementation_plan.md` are the *historical* v1 plan (phases 0–4, all complete); this file is what's true now and what's next.

**How work proceeds:** phases are over. Work is small, tracked increments. Each picks one or two items from "Next" or "Deferred", ships them, updates this file, and replaces `docs/next_session.md` with the following handoff.

Last updated: **2026-05-14** (v1.5 — repositioning + namespace migration).

---

## Status snapshot

- **15 packages** in the workspace, **all published on npm** (2026-05-14). Note: the MCP adapter ships as **`acture-mcp-server`** — the unscoped name `acture-mcp` was already taken by an unrelated project, so the package was renamed.
- **396 package tests + 41 example tests** green; all packages and examples build + typecheck.
- Canonical positioning is now written down (`docs/positioning.md`) and wired into the skills.
- 14 skills: 8 dev (`acture-*`), 5 migration-track (`migration-*`), 1 consumer-integration foundation (`acture-consumer-integration`).

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

---

## In progress / immediate next

**`acture` core positioning-alignment review** — `docs/next_session.md`. Audit `packages/core` against `docs/positioning.md`: (A) is core genuinely the minimal primitive, or has accelerator/adapter logic crept in? (B) is the agent-written path *reproducible*, not just asserted — could an agent hand-write an equivalent registry from the skills + core's source? Refactor only what the audit justifies. The `CommandRecord` stays closed at 15 fields.

Also unblocked, owner-discretion: **publish the 13 renamed packages** to npm.

---

## Next

**Macros + e2e testing tooling.** These two consumer surfaces are structurally near-identical — a sequence (or DAG) of `{commandId, params}` pairs, with assertions in the e2e case (journal §3.4, §3.7: "an end-to-end test is a macro with assertions"). They were the least-tooled surfaces. Build them per the positioning:

- **Core enables; packages are separate and optional; each gets a consumer skill.** The command-sequence *concept* (record / compose / replay) is something the agent can hand-write following a documented pattern. Specialized, tool-bound implementations are *separate optional packages*.
- **`acture-e2e-playwright`** — a separate package with reusable e2e code bound specifically to **Playwright**. (Playwright is the tool choice here; the consumer skill must still document the agent-written path and that other runners are valid choices — per `acture-consumer-integration`.)
- **Macros** — a record/replay tool. Decide during that session whether it ships as a package, a pattern + skill, or both — guided by the positioning and the rule of three.
- Each surface gets a **consumer-integration skill** (`acture-e2e`, `acture-macros`) building on `acture-consumer-integration`.

Open design question to settle that session: macros and e2e share so much structure that a single command-sequence substrate underneath both may be the right shape — rather than two unrelated packages. Evaluate before committing.

---

## Deferred / backlog

Valid, not scheduled. Pick up when prioritized.

- **Codemods README/CLI polish** — from the v1.4 fresh-agent test (`docs/fresh-agent-test-results.md`): the README's `npx acture-codemods` invocation story, undocumented per-codemod `--option` keys, undocumented `--manifest`/`--files-from`, and the ambiguous "No files matched" error. Full candidate list parked in `docs/backlog/codemods-polish-and-tier-mirror.md`.
- **`.d.ts` mirror of resolved tier values** — optional `acture-build-tier` polish. Parked in the same backlog file.
- **AI-codemod-recipe doc** — research-4 recommendation #8: a doc showing how to prompt an agent to author a one-off codemod. Parked in the same backlog file.
- **Per-surface consumer skills** — `acture-consumer-integration` is the foundation; per-surface skills exist only for the palette (`acture-palette-design`). Hotkeys, MCP, AI, e2e, macros, telemetry, undo, extensions still need consumer skills. (e2e + macros are covered by the "Next" item above; the rest are backlog.)
- **Greenfield agent-track skills** — the skill set is currently weighted toward migration and toward acture's internals. There is no greenfield "agent, help me build a command-dispatch app from scratch" track. Worth building once the consumer-skill family fills in.

---

## Post-v1 (deferred, not committed)

Per `docs/v1_plan.md` §"Post-v1" — none ship without explicit user direction **and** three concrete callers (rule of three):

- **`acture-undo`** — patch-based undo, transactions, effect queue. `Result<R>` already reserves `patches?` / `effects?`; `PatchCapableAdapter` is implemented by the state adapters.
- **`acture-telemetry`** — middleware logging every dispatch.
- **`acture-sandbox`** — membrane-pattern third-party extension sandboxing.
- **`acture-test-property`** — fast-check arbitraries derived from command param schemas; random command sequences asserting state invariants. (Note: overlaps the macros/e2e "Next" item — revisit scope when that lands.)
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
| `acture` core positioning-alignment review | ⏭️ Immediate next — `docs/next_session.md` |
| Macros tooling | ⏭️ Next |
| e2e testing tooling (`acture-e2e-playwright`) | ⏭️ Next |
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
