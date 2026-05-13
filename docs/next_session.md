# Next Session — v1.4 Planning

**Your role:** You are the v1.4 planning / implementing agent. **v1.3 is DONE as of 2026-05-13.** Phase 4 v1.0 + v1.1 + v1.2 + v1.3 increments have all landed. Your job is to confirm v1.4 scope with the user and ship it.

**v1.3 finished 2026-05-13.** Repo state at handoff:

- **14 packages publishable.** Versions: `acture@1.1.0`, `@acture/cli@1.2.0`, `@acture/migration@1.1.0`, `@acture/build-tier@1.1.0`, `@acture/codemods@1.1.0`, others at `1.0.0`.
- **380 package tests** + **41 example tests** all green.
- **4 worked examples** unchanged.
- All packages typecheck and build via tsup / vite.
- v1.3 reflection: [`docs/v1_3-reflection.md`](v1_3-reflection.md).

What v1.3 shipped on top of v1.2:

- `redux-action-to-command` codemod (research-4 §B.5 row 2).
- `usestate-mutation-to-command` codemod (research-4 §B.5 row 3).
- `rtk-thunk-to-command` codemod (research-4 §B.5 row 5).
- Manifest now contains ZERO `status: 'planned'` entries — research-4 §B.5 is fully shipped.

What's still in the backlog:

- **`eslint-plugin-acture-migration`** — `acture/no-stale-wrap-mutation` rule. Research-4 §"Defer to v1.2" item #9, slipped through v1.2 and v1.3. Three-callers check: any migration that uses `wrapMutation` extensively accumulates stale wrappers; ESLint is the natural feedback channel.
- **`.d.ts` mirror of resolved tier values.** Optional polish — JSDoc already surfaces in `.d.ts`; this would put the resolved `tier: 'experimental'` on the type-system path too.
- **Hypermod-style AI-generation recipe doc.** Research-4 recommendation #8 — markdown doc in `docs/` showing how to ask Claude to write a one-off codemod for a handler shape.
- **Fresh-agent / second-agent release gate.** Phase-4 reflection §5 deferred this through v1.0 → v1.3. The `@acture/codemods` README is now the densest agent-facing surface; this is the right session to run the ritual.

---

## Step 1 — Orient

Read in this order (~15 minutes total):

1. `docs/v1_3-reflection.md` — what v1.3 found, especially §"Pre-v1.4 reflection answers" §4 (release gate recommendation).
2. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before merging anything.
3. `docs/v1_plan.md` §"Post-v1 (deferred, not committed)" — long-term backlog (undo, macros, telemetry, Python companion). None promote to v1.4 without explicit user direction.

## Step 2 — Pick v1.4 scope

Rule of three. The four candidates below are concrete and bounded. Pick at most TWO unless the user explicitly authorizes more.

**Strong candidates (v1.4):**

1. **`eslint-plugin-acture-migration`** with `acture/no-stale-wrap-mutation`. Flags `wrapMutation(...)` calls where the wrapped handler is the only caller — the migration has graduated and the wrapper is now dead weight. One-rule plugin, small surface, high signal for active migrations. ~150 lines + ~10 tests. Three-callers check passes: research-4 named it; the migration-graduate skill points at it; active wrappers accumulate stale.

2. **Fresh-agent / second-agent release gate ritual.** Run the experiment: a fresh agent reads `@acture/codemods/README.md` and uses the CLI on a sample handler. Document the result in `docs/fresh-agent-test-results.md`. No code change; the deliverable is a written assessment of where the README + CLI fall short (if anywhere). Could pair with #1 — both are release-readiness work.

**Medium candidates (could ship as quick polish):**

3. **`.d.ts` mirror of resolved tier values.** A tsup post-process pass that walks the emitted `.d.ts` files and injects the resolved `tier:` value at the type level. Small lift if implemented as a `@acture/build-tier/dts-mirror` companion to the existing JS-side mirror.

4. **Hypermod-style AI-generation recipe doc.** Pure docs (no code) — markdown in `docs/` showing how to prompt Claude to author a one-off codemod for a handler shape that doesn't match any of the shipped five. The recipe references the existing `Codemod` interface so users can drop the generated code into the `@acture/codemods` package or use it standalone.

**My recommendation if asked:** ship **#1 (ESLint plugin)** plus **#2 (fresh-agent test)**. Together they round out the "release-readiness" theme of v1.4 — one closes a documented backlog item, the other validates the agent-facing surface is solid before declaring v1.x complete. #3 and #4 are post-v1.4 polish.

## Step 3 — Things that are still post-v1.4

These remain `docs/v1_plan.md` §"Post-v1 (deferred, not committed)":

- `acture/undo`.
- `acture/macros`, `acture/telemetry`, `acture/sandbox`, `acture/test-property`.
- `acture/state-jotai`, `acture/state-valtio`.
- Python companion (research-6 not executed).

Do NOT promote any of these without explicit user direction AND three concrete callers.

## Step 4 — Hard-don'ts still in force

Re-read `.claude/skills/acture-hard-donts/SKILL.md`. The closed-surface principle held through v1.0 + v1.1 + v1.2 + v1.3. CommandRecord remains at 15 fields. Hold the line.

## Step 5 — Release ceremony for v1.4

When v1.4 deliverables are merged and tests are green:

1. Bump only the affected packages.
2. `pnpm -r --filter "./packages/*" build && pnpm test` — green.
3. `npm pack --dry-run` clean for each bumped package.
4. Tag and publish (owner discretion).
5. Write `docs/v1_4-reflection.md`.
6. Replace this file with a v1.5 / post-v1 planning prompt.

## When unsure

Re-read this file, `docs/v1_3-reflection.md`, `docs/v1_plan.md` §"Post-v1", and `.claude/skills/acture-hard-donts/SKILL.md`. If still unsure, append a note to `docs/escalations.md` (create if missing) and ask the user before locking in any irreversible decision.

**Good luck.** v1.3 finished the research-4 §B.5 codemod set cleanly. v1.4 should focus on release-readiness — the remaining backlog items are all either small polish or process work. Don't promote post-v1 items into v1.x.
