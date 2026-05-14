# v1.4 Reflection

**Authored:** 2026-05-14 by the v1.4 implementing agent. All previous tests still pass; **396 package tests** (was 380 at end of v1.3; +16 from the new ESLint rule). Example tests unchanged at 41. Every package and example typechecks and builds via tsup / vite.

v1.4 was a **release-readiness** session, not a feature session. The user authorized exactly the two recommended candidates from `docs/next_session.md`: the ESLint plugin (#1) and the fresh-agent release-gate test (#2). Both shipped; nothing else was promoted.

## What v1.4 shipped

### 1. `eslint-plugin-acture-migration` — new package (`@1.0.0`)

One rule, `acture/no-stale-wrap-mutation`. It flags `wrapMutation(...)` calls whose **return value is never used** — the only effect of such a call is the registry-registration side effect, which means the strangler-fig wrapper has graduated and the command should be authored directly with `defineCommand`.

Detection is single-file and conservative, by design (research-4's codemod principle: a high-confidence partial signal beats a noisy total one):

- Tracks `wrapMutation` imported — named or aliased — from `@acture/migration` (configurable via the `module` option). Namespace imports are not tracked.
- Reports two shapes: a bare `ExpressionStatement`, and assignment to a non-exported local binding with zero references beyond its own initializer.
- Stays silent on exported bindings, referenced bindings, returned results, and results passed as arguments — any of which may still be load-bearing.

~140 lines of rule + index, 16 RuleTester cases wired into vitest. The package has zero runtime dependencies; `eslint >=9` is a peer dependency. The `migration-graduate` skill now points at the rule (the v1.4 next-session prompt had assumed it already did — it didn't, now it does).

### 2. Fresh-agent release-gate test — `docs/fresh-agent-test-results.md`

The Phase-4-reflection §5 gate, deferred through v1.0 → v1.3, finally ran. A fresh agent — no acture context — drove `@acture/codemods` from its README alone. Verdict: the **codemod engine + CLI passed** (the abstraction shape, the `--dry-run`/`--json` contract, `--list`/`--help`, the bad-codemod-name error all rated solid), but the **README did not** — its headline `npx @acture/codemods` invocation fails pre-publish, and per-codemod `--option` keys / `--manifest` / `--files-from` are undiscoverable from the docs. Per the next-session scope (#2 = no code change), the fixes are written up and carried to v1.5 as the top candidate.

## What v1.4 did NOT ship

The two medium candidates from `docs/next_session.md`, deliberately not promoted (rule of three; the user authorized exactly #1 + #2):

- **`.d.ts` mirror of resolved tier values.** Still optional polish. Deferred.
- **Hypermod-style AI-generation recipe doc.** Still optional. Deferred.

Post-v1 items (`undo`, `macros`, `telemetry`, `sandbox`, `test-property`, `state-jotai`/`state-valtio`, Python companion) remain untouched and uncommitted.

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.4 increment.

1. **No conditional logic in command metadata.** ✅ Zero `CommandRecord` shape changes (still 15 fields). The ESLint rule reads source AST; it never touches the record shape.
2. **No god-package.** ✅ The ESLint plugin is its own package with one rule and zero runtime deps — the opposite of bloat. It does not re-export anything from `acture` or `@acture/migration`.
3. **No business logic in adapter packages.** ✅ The rule is a static analyzer: AST in, lint report out. It makes no domain decisions — it does not decide *whether* to graduate, only flags the structural signal. The cross-file verification and the actual rewrite stay with the human/agent (per the `migration-graduate` skill).
4. **No `if (mode === ...)` in shared helpers.** ✅ The rule branches on AST shape (bare statement vs. unused binding) and on the user-supplied `module` option. No positioning-path awareness.
5. **No `eval()`-ing LLM-produced strings.** ✅ N/A — a lint rule executes nothing.
6. **No coupling the registry to React.** ✅ N/A — the plugin doesn't import `acture` at all, let alone React.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ The one rule ships `@stable` from 1.0.0; there was no prior experimental version.
8. **No bundling a UI kit.** ✅ N/A.
9. **No marketing on category.** ✅ The README leads with the concrete win ("catch `wrapMutation` wrappers that have outlived their purpose"), not an architecture pitch.
10. **No assuming the LLM's chosen function is authorization.** ✅ N/A.

**One ESLint-specific gotcha caught during the session:** ESLint's scope model counts a `const x = …` binding's *own initializer* as a (write) `Reference`. The first cut of `no-stale-wrap-mutation` checked `variable.references.length === 0` and therefore never fired on the `const x = wrapMutation(...)` shape. The fix: `variable.references.every((ref) => ref.init === true)` — ignore the initializer write, count only uses beyond the declaration. Worth remembering for any future scope-analysis rule.

## Versioning

v1.4 adds **one new package** (`eslint-plugin-acture-migration@1.0.0`) and **one docs file**. No existing package's source changed, so **no changeset was created** — a changeset would force an unwanted bump, and `changeset publish` auto-detects the new package and publishes it at its stated `1.0.0`. This is the cleanest possible "bump only the affected packages": the only affected package is new and already at its intended version.

## Stat sheet

| Metric | v1.3 end | v1.4 end | Δ |
| --- | --- | --- | --- |
| Packages | 14 | 15 | +1 (`eslint-plugin-acture-migration`) |
| Worked examples | 4 | 4 | 0 |
| Tests (packages) | 380 | 396 | +16 (ESLint RuleTester suite) |
| Tests (examples) | 41 | 41 | 0 |
| CommandRecord fields | 15 | 15 | 0 — closed surface still holds |
| Versions touched | codemods→1.1.0 | none (new pkg at 1.0.0) | targeted |
| Release-gate rituals run | 0 | 1 (fresh-agent test) | +1 |

CI green across the workspace; `npm pack --dry-run` clean for `eslint-plugin-acture-migration@1.0.0` (8 files, 6.7 kB).

## Pre-v1.5 reflection answers

1. **Did the "one rule, one package" shape hold?** Yes. The package is ~140 lines of rule logic + a thin index that exposes the rule and a `recommended` flat config. No temptation toward a second rule appeared — the three-callers test for `no-stale-wrap-mutation` passed (research-4 named it; the `migration-graduate` skill now points at it; active migrations accumulate stale wrappers), but no second rule has three callers yet. If/when one does, it's a one-file addition to the same package.

2. **Is the rule's conservatism the right call?** Yes, but it has a known blind spot: a wrapper whose result is exported and then unused *cross-file* is not caught (ESLint rules are single-file). The honest framing — documented in the README's "Detection contract" — is that false negatives are expected and false positives should be rare. A type-aware / project-graph version could close the gap, but that's a much bigger lift and nobody has asked. Not promoting it without three callers.

3. **What did the fresh-agent test actually prove?** That the codemod *engine* is release-ready and the codemod *README* is not. The gap is documentation drift (the README was written assuming a published package), not a design flaw — which is the good kind of finding for a release gate. v1.5's top candidate is the codemods README + CLI polish pass (see `docs/next_session.md`).

4. **Should v1.4 have fixed the codemods README in-session?** No — `docs/next_session.md` explicitly scoped #2 as no-code-change, and honoring that kept the session to exactly two deliverables. But the temptation was real: several of the findings are trivial edits. Carrying them as a *named, scoped* v1.5 candidate (rather than scope-creeping v1.4) is the rule-of-three-respecting move.

5. **Hard-don'ts audit.** Clean.

## Release readiness

- ✅ All 15 packages typecheck and build.
- ✅ 396 package tests + 41 example tests green.
- ✅ `npm pack --dry-run` clean for `eslint-plugin-acture-migration@1.0.0`.
- ✅ Hard-don'ts audit clean.
- ✅ Fresh-agent release-gate test run and documented (`docs/fresh-agent-test-results.md`).

**v1.4 is DONE.** Next session: see `docs/next_session.md` for the v1.5 planning prompt (codemods README/CLI polish, `.d.ts` tier mirror, AI-recipe doc).
