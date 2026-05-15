> **PARKED — 2026-05-14.** This was the v1.4-era handoff. v1.5 instead became a *repositioning + namespace-migration* increment (see `docs/roadmap.md`), and the immediate next step is a core positioning-alignment review (see `docs/next_session.md`). The three candidates below — codemods README/CLI polish, the `.d.ts` tier mirror, and the AI-codemod-recipe doc — are still valid backlog items; they are tracked in `docs/roadmap.md` §"Deferred / backlog". Pick this file back up when those items are scheduled. The version numbers and "next session" framing below are stale; read them as a candidate list, not a plan.

---

# Next Session — v1.5 Planning *(superseded — see banner above)*

**Your role:** You are the v1.5 planning / implementing agent. **v1.4 is DONE as of 2026-05-14.** Phase 4 v1.0 + v1.1 + v1.2 + v1.3 + v1.4 increments have all landed. Your job is to confirm v1.5 scope with the user and ship it.

**v1.4 finished 2026-05-14.** Repo state at handoff:

- **15 packages publishable.** New this increment: `eslint-plugin-acture-migration@1.0.0`. Other notable versions: `acture@1.1.0`, `acture-cli@1.2.0`, `acture-migration@1.1.0`, `acture-build-tier@1.1.0`, `acture-codemods@1.1.0`, the rest at `1.0.0`.
- **396 package tests** + **41 example tests** all green.
- **4 worked examples** unchanged.
- All packages typecheck and build via tsup / vite.
- v1.4 reflection: [`docs/v1_4-reflection.md`](v1_4-reflection.md).
- v1.4 ran the deferred fresh-agent release-gate test — results in [`docs/fresh-agent-test-results.md`](fresh-agent-test-results.md).

What v1.4 shipped on top of v1.3:

- **`eslint-plugin-acture-migration`** — one rule, `acture/no-stale-wrap-mutation`, flags `wrapMutation(...)` calls whose result is never used (the migration has graduated; author with `defineCommand`). Closes a research-4 backlog item carried since v1.1. The `migration-graduate` skill now points at it.
- **Fresh-agent release-gate test** — a fresh agent drove `acture-codemods` from its README alone. Engine + CLI passed; the README did not (see below).

What's still in the backlog:

- **Codemods README + CLI polish.** The v1.4 fresh-agent test found the `acture-codemods` README's headline `npx acture-codemods` invocation fails pre-publish, and that per-codemod `--option` keys, `--manifest`, and `--files-from` are undiscoverable from the docs. The CLI also gives an ambiguous "No files matched" error for missing-vs-nonexistent `--target`. Full finding list and priority order in [`docs/fresh-agent-test-results.md`](fresh-agent-test-results.md) §"Recommended v1.5 follow-up". This is the direct, scoped output of v1.4's release gate.
- **`.d.ts` mirror of resolved tier values.** Optional polish — JSDoc already surfaces in `.d.ts`; this would put the resolved `tier: 'experimental'` on the type-system path too. Slipped through v1.2 → v1.4.
- **Hypermod-style AI-generation recipe doc.** Research-4 recommendation #8 — markdown doc in `docs/` showing how to ask Claude to write a one-off codemod for a handler shape that doesn't match any of the shipped five.

---

## Step 1 — Orient

Read in this order (~15 minutes total):

1. `docs/v1_4-reflection.md` — what v1.4 found, especially §"Pre-v1.5 reflection answers".
2. `docs/fresh-agent-test-results.md` — the release-gate findings that drive the top v1.5 candidate.
3. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before merging anything.
4. `docs/v1_plan.md` §"Post-v1 (deferred, not committed)" — long-term backlog (undo, macros, telemetry, Python companion). None promote to v1.5 without explicit user direction.

## Step 2 — Pick v1.5 scope

Rule of three. The three candidates below are concrete and bounded. Pick at most TWO unless the user explicitly authorizes more.

**Strong candidate (v1.5):**

1. **Codemods README + CLI polish.** Act on `docs/fresh-agent-test-results.md` §"Recommended v1.5 follow-up". In priority order: (a) fix the invocation story — document a monorepo invocation (`node dist/cli.js …` or a workspace bin) alongside the `npx` form, or add an explicit publish-status line so the Quick start contains at least one command that runs today; (b) document per-codemod `--option` keys — a column in the codemod table or a per-codemod sub-section; (c) document `--manifest` and `--files-from` in the README; (d) disambiguate the "No files matched" CLI error for missing-vs-nonexistent `--target`. Mostly a README pass plus one small CLI error-message edit + ~3 tests. This is the direct output of v1.4's release gate — high signal, well-scoped.

**Medium candidates (could ship as quick polish):**

2. **`.d.ts` mirror of resolved tier values.** A tsup post-process pass that walks the emitted `.d.ts` files and injects the resolved `tier:` value at the type level. Small lift if implemented as a `acture-build-tier/dts-mirror` companion to the existing JS-side mirror.

3. **Hypermod-style AI-generation recipe doc.** Pure docs (no code) — markdown in `docs/` showing how to prompt Claude to author a one-off codemod for a handler shape that doesn't match any of the shipped five. References the existing `Codemod` interface so users can drop the generated code into `acture-codemods` or use it standalone.

**My recommendation if asked:** ship **#1 (codemods polish)** — it closes the loop on the v1.4 release gate and removes a real "first command fails" blocker. Optionally pair with **#3 (AI-recipe doc)** since it's pure docs and thematically adjacent to the codemods surface. #2 is still optional polish and can wait.

## Step 3 — Things that are still post-v1.5

These remain `docs/v1_plan.md` §"Post-v1 (deferred, not committed)":

- `acture/undo`.
- `acture/macros`, `acture/telemetry`, `acture/sandbox`, `acture/test-property`.
- `acture/state-jotai`, `acture/state-valtio`.
- Python companion (research-6 not executed).

Do NOT promote any of these without explicit user direction. (Earlier drafts of this file also gated post-v1 promotion on "three concrete callers" — that was a misapplication of the rule of three; see `docs/redesign_takeaways.md` §6. Post-v1 items pull forward on user direction plus the standard maintainer principles.)

## Step 4 — Hard-don'ts still in force

Re-read `.claude/skills/acture-hard-donts/SKILL.md`. The closed-surface principle held through v1.0 → v1.4. CommandRecord remains at 15 fields. Hold the line.

## Step 5 — Release ceremony for v1.5

When v1.5 deliverables are merged and tests are green:

1. Bump only the affected packages (e.g. `acture-codemods` if its CLI/README changed — a `patch` for docs + error-message, a `minor` if a new flag is added).
2. `pnpm -r --filter "./packages/*" build && pnpm test` — green.
3. `npm pack --dry-run` clean for each bumped package.
4. Tag and publish (owner discretion).
5. Write `docs/v1_5-reflection.md`.
6. Replace this file with a v1.6 / post-v1 planning prompt.

## When unsure

Re-read this file, `docs/v1_4-reflection.md`, `docs/fresh-agent-test-results.md`, `docs/v1_plan.md` §"Post-v1", and `.claude/skills/acture-hard-donts/SKILL.md`. If still unsure, append a note to `docs/escalations.md` (create if missing) and ask the user before locking in any irreversible decision.

**Good luck.** v1.4 rounded out the release-readiness theme — the ESLint plugin closed a backlog item and the fresh-agent test validated the codemod surface, surfacing a tight, scoped punch list. v1.5 should act on that punch list. Don't promote post-v1 items into v1.x.
