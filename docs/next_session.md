# Next Session — v1.2 Planning

**Your role:** You are the v1.2 planning / implementing agent. **v1.1 is DONE as of 2026-05-13.** The Phase 4 v1.0 deliverables plus two v1.1 increments (`enableTierWarnings` and the `acture snapshot` CLI subcommand) have all landed. Your job is to commit to v1.2 scope and ship it.

**v1.1 finished 2026-05-13.** Repo state at handoff:

- **13 packages publishable.** `acture` and `@acture/cli` at **1.1.0**; the other 11 packages at **1.0.0** (untouched in the v1.1 increment).
- **288 package tests** + **36 example tests** all green. Was 270 at Phase 4 end; +18 from the v1.1 work (8 `tier-warnings` tests in core, 6 `snapshot-cmd` tests in cli, 4 new cli integration tests).
- **3 worked examples** unchanged.
- All packages typecheck and build via tsup / vite; the greenfield example builds clean.
- Phase 4 reflection: [`docs/phase-4-reflection.md`](phase-4-reflection.md). It covered v1.0 plus called out v1.1 deferrals; this session shipped two of those (#3 and #4 in the original handoff).

What v1.1 actually shipped on top of v1.0:

1. **`enableTierWarnings(registry, options?)` in core** (`packages/core/src/tier-warnings.ts`). Wraps `dispatch` so the first dispatch of each `@experimental` command emits `console.warn` once-per-process per command. Suppressible via `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1` or `enabled: false`. Idempotent (WeakMap-keyed) with a disposer for test isolation.
2. **`acture snapshot` subcommand** (`packages/cli/src/snapshot-cmd.ts` + `cli.ts`). Loads a registry config (`./registry.mjs` default-exporting the `Registry`, awaits Promise<Registry> if returned) and emits the same JSON envelope `compare-schemas` reads. Supports `--out`, `--tiers stable,experimental`, helpful errors with a `tsx` hint for `.ts` configs.

What v1.1 did **not** ship (still in the v1.2 backlog):

- `acture/codemods` (research-4 §B.5).
- DOM-event interception middleware (research-4 §A.5).
- An RTK worked example exercising `actureMiddleware` end-to-end.
- AST-mode for `@acture/build-tier` (regex fallback is the documented behavior; AST would be a polish).
- Deep nested object diffs in `compare-schemas` (shallow `properties` diff is what shipped).
- `.d.ts` mirror of resolved tier values (the JSDoc tag survives natively; a transformer-plugin polish remains optional).

---

## Step 1 — Orient

Read in this order (~30 minutes total):

1. `docs/phase-4-reflection.md` — what Phase 4 found, especially §3 (deferred items) and §5 (release-gate item).
2. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before merging anything. The closed CommandRecord surface and the rule-of-three are the load-bearing rails.
3. `docs/v1_plan.md` §"Post-v1 (deferred, not committed)" — the long-term backlog. None of these promote to v1.2 without explicit user direction.
4. The relevant research file for whatever v1.2 scope the user picks. Most likely candidates:
   - Codemods: `docs/research/acture_research_4 -- Transitional APIs and Codemod Tooling ...md` §B.5, §A.7.
   - DOM interception: `docs/research/acture_research_4 ...md` §A.5.

**Do NOT re-read** research files 1, 2, 3, or 5 unless they directly inform v1.2 scope.

## Step 2 — Pick v1.2 scope

The candidates below are the v1.1 backlog leftover plus two new ones that surfaced during Phase 4 / v1.1. Rule of three — pick at most TWO. Do not start any without confirming three concrete callers want it.

**Strong candidates (v1.2):**

1. **`acture/codemods`** (research-4 §B.5).
   - State today: deferred from Phase 3, reaffirmed deferred in Phase 4 §3.
   - Scope: an `ast-grep` or `ts-morph`-based transformer that converts hand-applied `wrapMutation` calls to direct `defineCommand`, automating what `migration-graduate` does manually.
   - Three-callers check: ask the user. Codemods are heavy lift; only commit if there are 3+ real migrations in flight.

2. **DOM-event interception middleware** (research-4 §A.5).
   - State today: `actureMiddleware` covers Redux/RTK; DOM-event interception is the React + vanilla equivalent.
   - Scope: a small adapter that intercepts `onClick` / form `onSubmit` handlers in a tree and routes through `registry.dispatch`, with opt-in scoping.
   - Three-callers check: ask the user.

**Medium candidates (could ship as quick polish):**

3. **RTK worked example.** `actureMiddleware` is unit-tested but has no fixture. A `examples/migration/redux-wrap/` would close the gap. Small lift, demonstrative value.

4. **AST-mode for `@acture/build-tier`.** A second entry point that uses `ts-morph` for the regex's exotic-input edge cases. Strictly a polish — the regex handles the common case.

5. **Deep nested object diffs in `compare-schemas`.** Today the diff walks the top-level `properties` and one level of `enum`/`type`. A research-5 §6.1-faithful classifier would recurse. Important once real users have nested input schemas; not blocking until then.

**My recommendation if asked:** ship **#3 (RTK example)** plus one of #1 or #2 depending on user appetite for migration tooling vs. drop-in surface area. #4 and #5 are post-v1.2 polish.

## Step 3 — Things that are still post-v1.2 (not v1.2 scope)

These remain `docs/v1_plan.md` §"Post-v1 (deferred, not committed)":

- `acture/undo` (hooks reserved in Phase 1 — patches/effects on Result).
- `acture/macros`, `acture/telemetry`, `acture/sandbox`, `acture/test-property`.
- `acture/state-jotai`, `acture/state-valtio`.
- Python companion (research-6 not executed).

Do NOT promote any of these without explicit user direction AND three concrete callers.

## Step 4 — Hard-don'ts: still in force

Re-read `.claude/skills/acture-hard-donts/SKILL.md`. Phase 4 added two CommandRecord fields (`deprecationReason`, `internalToken`); v1.1 added zero. The closed-surface principle is what kept Phase 4 from spiraling into Inner-Platform-Effect territory and v1.1 from sneaking a third addition through. Hold the line.

Specifically: when a v1.2 contributor proposes a new CommandRecord field, ask "is this composable into the handler?" before approving. The answer is almost always yes; the field is almost never needed.

## Step 5 — Release ceremony for whatever v1.2 ships

When v1.2 deliverables are merged and tests are green:

1. Bump the affected packages (only the ones that changed).
2. `pnpm -r --filter "./packages/*" build && pnpm test` — green.
3. `npm pack --dry-run` clean for each bumped package.
4. Tag and publish (owner discretion).
5. Update `.acture/snapshot.json` baseline on the new tag for future `compare-schemas` runs.
6. Replace this file with a v1.3 / post-v1 planning prompt.

## When unsure

Re-read this file, `docs/phase-4-reflection.md`, `docs/v1_plan.md` §"Post-v1", and `.claude/skills/acture-hard-donts/SKILL.md`. If still unsure, append a note to `docs/escalations.md` (create if missing) and ask the user before locking in any irreversible decision.

**Good luck.** v1.1 was a small targeted increment; v1.2 can be either similarly small or genuinely strategic (codemods, DOM interception). Don't over-commit. Three concrete callers per addition. Reflection note at `docs/v1_2-reflection.md` (or its rename if scope formalizes) when v1.2 ships.
