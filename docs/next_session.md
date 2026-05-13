# Next Session — v1.3 Planning

**Your role:** You are the v1.3 planning / implementing agent. **v1.2 is DONE as of 2026-05-13.** Phase 4 v1.0 + the v1.1 increment + the v1.2 increment have all landed. Your job is to confirm v1.3 scope with the user and ship it.

**v1.2 finished 2026-05-13.** Repo state at handoff:

- **14 packages publishable.** Versions: `acture@1.1.0`, `@acture/cli@1.2.0`, `@acture/migration@1.1.0`, `@acture/build-tier@1.1.0`, `@acture/codemods@1.0.0` (new), others at `1.0.0`.
- **350 package tests** + **41 example tests** all green. Was 288 / 36 at v1.1 end.
- **4 worked examples** including the new `examples/migration/redux-wrap/`.
- All packages typecheck and build via tsup / vite. All examples typecheck and build.
- v1.2 reflection: [`docs/v1_2-reflection.md`](v1_2-reflection.md).

What v1.2 shipped on top of v1.1:

1. **`@acture/codemods` package** — single `npx`-invokable CLI with two shipped transforms (`wrap-handler-with-mutation`, `extract-onclick-to-command`), a manifest of 3 planned ones, `--dry-run` + `--json`, programmatic `runCodemod()`.
2. **`createDomInterceptor`** in `@acture/migration` — delegated DOM listener that routes `data-acture-command` events through the registry. Plain TS, works in any framework, jsdom-tested.
3. **RTK worked example** `examples/migration/redux-wrap/` — `actureMiddleware` end-to-end with a Redux Toolkit cart slice. UI dispatch and palette dispatch converge on the same store.
4. **AST mode for `@acture/build-tier`** at `@acture/build-tier/ast` — ts-morph-based, handles 5000-char spec bodies and template-literal substitutions the regex transform falls through on. Optional peer dep.
5. **Deep nested object diffs in `compare-schemas`** — `classifyChanges` recurses through nested `properties` and array `items`. Change paths read `inputSchema.properties.user.properties.email`.

What v1.2 did **not** ship (still in the v1.3 backlog):

- **Three remaining codemods** (`redux-action-to-command`, `usestate-mutation-to-command`, `rtk-thunk-to-command`). Tracked in `packages/codemods/migrations.json` as `status: 'planned'`. Drop-in adds — the runner and manifest pattern are in place.
- **Graduation tooling** — `eslint-plugin-acture-migration` with `acture/no-stale-wrap-mutation`. Research-4 §"Defer to v1.2" item #9 named this; it slipped to v1.3.
- **`.d.ts` mirror of resolved tier values.** A TypeScript transformer plugin that writes the resolved `tier` into emitted `.d.ts` files. The JSDoc tag survives natively (IDE hover already shows it); this would just put it on the type-system path.
- **Hypermod-style AI-generation recipe doc.** Research-4 recommendation #8 — docs-only.
- **Fresh-agent / second-agent test as release gate.** Phase-4 reflection §5 + v1.1 reflection §3.5 deferred this. The codemods CLI is now the densest agent-facing surface; that's where the test would be most informative.

---

## Step 1 — Orient

Read in this order (~20 minutes total):

1. `docs/v1_2-reflection.md` — what v1.2 found, especially §"Pre-v1.3 reflection answers" §3 (deferred items).
2. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before merging anything. The closed CommandRecord surface and the rule-of-three are still the load-bearing rails.
3. `docs/v1_plan.md` §"Post-v1 (deferred, not committed)" — long-term backlog. None of these promote to v1.3 without explicit user direction.
4. `packages/codemods/migrations.json` and `packages/codemods/src/manifest.ts` — both name the 3 planned codemods. The next codemod is a drop-in once you've decided which one.

**Do NOT re-read** research files 1, 2, 3, or 5 unless they directly inform v1.3 scope. Research-4 §B.5 still informs codemods if the user picks that lane.

## Step 2 — Pick v1.3 scope

The candidates below are the v1.2 backlog leftover. Rule of three — pick at most TWO unless the user explicitly authorizes more. Do not start any without confirming three concrete callers want it.

**Strong candidates (v1.3):**

1. **Finish the codemod set.** Add `redux-action-to-command` and `usestate-mutation-to-command` (drop `rtk-thunk-to-command` if scope is tight — it's the type-aware one and benefits least from a session-level effort). The manifest + CLI + tests are in place; each codemod is ~150 lines + ~5 tests.
   - Three-callers check: research-4 §B.5 lists them as v1 scope, and the codemod CLI is incomplete without them.

2. **`eslint-plugin-acture-migration`.** Rule `acture/no-stale-wrap-mutation` flags `wrapMutation(...)` calls where the original handler has been deleted (i.e., where the wrapper is the only thing keeping the command alive — the migration should graduate). Research-4 §"Defer to v1.2" item #9.
   - Three-callers check: any migration that uses `wrapMutation` extensively will accumulate stale wrappers. ESLint is the natural feedback channel.

**Medium candidates (could ship as quick polish):**

3. **`.d.ts` mirror of resolved tier values.** A TypeScript transformer plugin OR a tsup post-process pass that writes the resolved `tier: 'experimental'` into emitted `.d.ts`. Small lift if approached via tsup's `dts.transform`; larger lift if approached via a real TS transformer plugin. JSDoc already surfaces — this is type-system polish.

4. **Hypermod-style AI-generation recipe doc.** Research-4 §"Ship in v1.1" recommendation #8. A markdown doc in `docs/` showing how to ask Claude to write a one-off codemod for a handler shape. Pure docs.

5. **Fresh-agent / second-agent release gate.** Run the test from phase-4 §5: fresh agent reads `packages/codemods/README.md` and uses `acture-codemods wrap-handler-with-mutation` on a sample handler in a new app. Document the result. Not a code change — a release-gate ritual.

**My recommendation if asked:** ship **#1 (finish codemods)** plus **#5 (fresh-agent gate)** if the user wants a release-readiness pass. If the user wants new capabilities, swap #5 for #2. #3 and #4 are post-v1.3 polish.

## Step 3 — Things that are still post-v1.3

These remain `docs/v1_plan.md` §"Post-v1 (deferred, not committed)":

- `acture/undo` (hooks reserved in Phase 1 — patches/effects on Result).
- `acture/macros`, `acture/telemetry`, `acture/sandbox`, `acture/test-property`.
- `acture/state-jotai`, `acture/state-valtio`.
- Python companion (research-6 not executed).

Do NOT promote any of these without explicit user direction AND three concrete callers.

## Step 4 — Hard-don'ts: still in force

Re-read `.claude/skills/acture-hard-donts/SKILL.md`. Phase 4 added two CommandRecord fields; v1.1 and v1.2 added zero. The closed-surface principle held through v1.2's five-deliverable session. Hold the line.

## Step 5 — Release ceremony for whatever v1.3 ships

When v1.3 deliverables are merged and tests are green:

1. Bump only the affected packages.
2. `pnpm -r --filter "./packages/*" build && pnpm test` — green.
3. `npm pack --dry-run` clean for each bumped package.
4. Tag and publish (owner discretion).
5. Update `.acture/snapshot.json` baseline on the new tag.
6. Write `docs/v1_3-reflection.md`.
7. Replace this file with a v1.4 / post-v1 planning prompt.

## When unsure

Re-read this file, `docs/v1_2-reflection.md`, `docs/v1_plan.md` §"Post-v1", and `.claude/skills/acture-hard-donts/SKILL.md`. If still unsure, append a note to `docs/escalations.md` (create if missing) and ask the user before locking in any irreversible decision.

**Good luck.** v1.2 was the largest v1.x increment so far (five deliverables, +62 tests, +1 package). v1.3 has a clean backlog and no urgent gaps. Pick small unless the user wants strategic.
