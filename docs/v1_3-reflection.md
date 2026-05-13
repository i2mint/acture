# v1.3 Reflection

**Authored:** 2026-05-13 by the v1.3 implementing agent. All previous tests still pass; **380 package tests** (was 350 at end of v1.2; +30 across three new codemods). Example tests unchanged at 41. Every package and example typechecks and builds via tsup / vite.

v1.3 finished the codemod set: the three remaining codemods from research-4 §B.5 shipped, completing the table. The CLI now lists all five, the manifest table is fully populated, and the in-code MANIFEST has zero `status: 'planned'` entries.

What v1.3 shipped:

- **`redux-action-to-command`** — `dispatch({type, payload})` → `registry.dispatch(id, payload)`. Conservative gates: skips non-literal types and action objects with extra Redux-metadata keys. Configurable callees, registry import path, and an optional slash→dot id rewrite. 10 tests.
- **`usestate-mutation-to-command`** — wraps inline handlers whose body is composed of `setX(...)` setter calls with `wrapMutation`, deriving a command id from the first setter (`setCount` → `app.state.setCount`). Configurable setter pattern (default `^set[A-Z]`) lets codebases that use different naming opt in. 9 tests.
- **`rtk-thunk-to-command`** — `createAsyncThunk(id, payloadCreator)` → `defineCommand({id, title, execute})`. Rewrites `return X` to `return ok(X)` (and appends `return ok(undefined);` when no explicit return). Skips thunks with an options arg. 11 tests.

---

## What v1.3 did NOT ship

Listed as v1.3 candidates in the previous next-session prompt:

- **`eslint-plugin-acture-migration`** with `acture/no-stale-wrap-mutation`. Not shipped — the codemod-set work consumed the session.
- **`.d.ts` mirror of resolved tier values.** Still optional polish. Deferred.
- **Hypermod-style AI-generation recipe doc.** Still optional. Deferred.
- **Fresh-agent / second-agent release gate.** Still deferred. The next session is the right place for this — with all five codemods shipped, the agent-facing surface is now stable enough for the fresh-eyes test to be informative.

---

## Codemod-set completion: the rule-of-three retrospective

The previous (v1.2) reflection asked whether the user's "ship all five" authorization had been sound for that session. v1.3 doubled down: the user authorized the *whole codemod set*. Three concrete callers exist for each:

- `redux-action-to-command` — every Redux/RTK adoption path. Three-callers test passes: the migration track skills explicitly mention this transform; research-4 §B.3 names the `azizhk/dispatch-your-reducer` gist as structurally identical.
- `usestate-mutation-to-command` — research-4 §B.5 row 3. Three-callers test: every React app that wraps useState mutations as commands.
- `rtk-thunk-to-command` — research-4 §B.5 row 5. Three-callers test: every RTK adoption that has async data flows.

Each is a one-file addition that drops into the existing manifest. The CLI, runner, diff formatter, and test harness from v1.2 all carried through without modification — which validates the abstraction shape.

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.3 increment.

1. **No conditional logic in command metadata.** ✅ Zero CommandRecord shape changes (still 15 fields).
2. **No god-package.** ✅ Zero new packages. Three new codemods inside the existing `@acture/codemods`.
3. **No business logic in adapter packages.** ✅ Codemods are translations: AST in, AST out. No domain decisions.
4. **No `if (mode === ...)` in shared helpers.** ✅ All three codemods branch on data (action shape, setter pattern, thunk shape) and on user-supplied options. No mode awareness.
5. **No `eval()`-ing LLM-produced strings.** ✅ Same as v1.2 — codemods read `--option key=value`, never reflectively invoke.
6. **No coupling the registry to React.** ✅ Codemods are build-time tools; they don't touch the registry runtime.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ All new exports `@stable` from v1.3.
8. **No bundling a UI kit.** ✅ N/A — no UI code in codemods.
9. **No marketing on category.** ✅ README leads with the codemod table.
10. **No assuming the LLM's chosen function is authorization.** ✅ N/A — codemods don't dispatch.

**One ts-morph-specific bug caught during the session:** iterating `getDescendantsOfKind(CallExpression)` and replacing nodes during iteration invalidates downstream nodes (`Attempted to get information from a node that was removed or forgotten`). The fix was to pre-filter the descendant list to only `createAsyncThunk` calls before mutating. This is a generic ts-morph gotcha worth remembering for future codemods.

---

## Stat sheet

| Metric | v1.2 end | v1.3 end | Δ |
| --- | --- | --- | --- |
| Packages | 14 | 14 | 0 |
| Worked examples | 4 | 4 | 0 |
| Tests (packages) | 350 | 380 | +30 (codemods: +30 across 3 new codemod test suites) |
| Tests (examples) | 41 | 41 | 0 |
| Codemod manifest entries | 5 (2 shipped + 3 planned) | 5 (all shipped) | +3 shipped |
| Codemod public exports | 2 (`wrapHandlerWithMutation`, `extractOnClickToCommand`) | 5 (+`reduxActionToCommand`, `useStateMutationToCommand`, `rtkThunkToCommand`) | +3 |
| CommandRecord fields | 15 | 15 | 0 — closed surface still holds |
| Versions touched | migration→1.1, build-tier→1.1, cli→1.2, codemods→1.0 | codemods→1.1.0 | targeted bump |

The +30 codemod tests bring the total package test count to 380. CI green across the workspace.

---

## Pre-v1.4 reflection answers

1. **Did the codemod abstraction shape (Codemod interface + MANIFEST + runner + CLI) survive the three-new-codemod increment?** Yes. Each new codemod is a one-file addition with a `Codemod` export. The CLI didn't change. The runner didn't change. The diff formatter didn't change. The tests follow the same `withFile` / `cleanup` pattern. This validates the v1.2 design choice to ship the manifest + 2 codemods rather than just an ad-hoc transform.

2. **What's the next codemod that wants to be written?** Probably **`extract-store-listener-to-command`** — find `store.subscribe((s) => …)` patterns and lift the side-effect block into a registered command. Not in research-4 §B.5; would be a v1.4 candidate IF three concrete callers asked for it. Not promoting without that signal.

3. **Is `--option` syntax enough, or do agents need a config-file fallback?** Probably enough for now. Across all five codemods, the longest `--option` chain we've documented is two flags. If a real migration drives users past that, a `--config <json>` flag is a one-line addition.

4. **What's the right release gate for v1.3?** Fresh-agent test. With all five codemods shipped, the `@acture/codemods` README is now the densest agent-facing surface in the repo. A fresh agent reading the README and running `acture-codemods <name> --target ... --dry-run` is the natural release-readiness signal. The release gate moves into the v1.4 plan.

5. **Hard-don'ts audit.** Clean.

---

## Release readiness

- ✅ All packages typecheck and build.
- ✅ 380 package tests + 41 example tests green.
- ✅ `npm pack --dry-run` clean for `@acture/codemods@1.1.0`.
- ✅ Hard-don'ts audit clean.
- 🟡 Fresh-agent test remains the recommended release gate for the next session.

**v1.3 is DONE.** Next session: see `docs/next_session.md` for the v1.4 planning prompt (ESLint plugin, `.d.ts` mirror polish, AI-recipe doc, fresh-agent release gate).
