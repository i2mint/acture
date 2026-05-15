# v1.9 Reflection

**Authored:** 2026-05-14 by the v1.9 implementing agent. Two backlog increments in one session. **422 package tests** (was 419; +3 from the `acture-codemods` CLI disambiguation tests) + 41 example tests, all green; every package and example builds + typechecks.

## The scope decision

`docs/next_session.md` left Step 1 open. The user delegated the call explicitly: *"fix what's fixable autonomously, don't block on manual work, tell me at the end what needs my hands."* Every backlog item is autonomous — README edits, CLI code, docs, skills — so the session shipped two increments back to back:

- **Part A** — the codemods README/CLI polish + AI-codemod-recipe doc (closing the whole `docs/backlog/codemods-polish-and-tier-mirror.md` file).
- **Part B** — the greenfield agent-track skills.

Nothing needs the user's hands. The only non-autonomous step in the vicinity — the npm publish of the pending `acture-codemods` changeset — is the normal release flow, not blocked work.

## Part A — codemods polish + AI-codemod-recipe doc

### CLI: the "No files matched" disambiguation (v1.4 fresh-agent finding #4)

The single ambiguous error became three distinct ones — `collectFiles` now returns a `CollectResult` discriminating: no `--target`/`--files-from` given at all; a path that does not exist (the typo case the fresh agent flagged); a path that exists but holds no `.ts`/`.tsx`/`.jsx` files. `--help` gained a Modes section (`--list`/`--manifest`) and an Exit codes section. +3 CLI tests (52 → 55), and the one pre-existing test whose assertion text changed was updated. `minor` changeset on `acture-codemods`.

### README: the rest of the fresh-agent findings

Finding #1 ("the headline `npx acture-codemods` 404s") turned out **resolved by reality** — `acture-codemods` is published on npm (`npm view` confirms `1.1.0` latest). The v1.4 test ran *before* the v1.5 publish. The README now states the published status, keeps the `npx` Quick start (which runs today), and adds the from-a-clone invocation for contributors. Findings #2/#3 are fixed by a full README rewrite: a flag table, a per-codemod **Codemod options** section documenting every `--option` key for all five codemods (extracted from each codemod's `resolveOptions`), `--manifest` vs `--list`, `--files-from`, and exit codes.

### `docs/ai-codemod-recipe.md` (research-4 recommendation #8)

A new doc: when none of the five shipped codemods fit a handler shape, have an agent author a one-off. It carries the `Codemod` interface contract, the four-point conservative-codemod discipline (conservative / visible skips / no type inference you can't do / no business logic), a ts-morph `run` skeleton, a fill-in-the-blanks prompt recipe, and the two ways to run the result (throwaway script vs. drop into `acture-codemods`). Framed in the dev-tool-first positioning: a one-off codemod is code the project owns, zero acture dependency.

### `.d.ts` tier mirror — deliberately NOT built

This was the third item in the codemods/tier backlog file. **Decision: do not build it.** It has been deferred v1.2 → v1.8 with *no concrete type-level consumer*; tier filtering happens at runtime (`registry.list({ tiers })` — the MCP/AI adapters), and nothing in the codebase consumes tier at the type level. Building a `.d.ts` post-process pass now would be speculative infrastructure — exactly what YAGNI guards against, and consistent with how v1.7 declined the `acture-sequence` substrate and v1.8 declined the no-package consumer skills. Instead the `acture-build-tier` README's caveat was rewritten to make the deferral explicit-with-rationale rather than an implicit TODO. (The user's "fix what's fixable" framing applies: the `.d.ts` mirror is not *broken* — its absence is a documented, deliberate limitation.)

### Bonus fix — `.changeset/README.md`

Discovered stale during the release-ceremony step: it still described the `fixed` version group that v1.7 dropped, and a "0.x quirk — use `patch` until v1.0.0" section that no longer applies (the suite is at 1.x). Rewritten to describe independent per-package versioning and post-1.0 semver. Also corrected a stale claim in `docs/next_session.md`: the v1.6/v1.7 changesets it listed as "pending" were already consumed by PR #14 (`chore(release): bump versions`) — there are no pending changesets except the new v1.9 one.

## Part B — greenfield agent-track skills

The `acture-greenfield` foundation (v1.6) had no per-step skills below it. v1.9 added the two the backlog named:

- **`acture-greenfield-state-model`** — expands the foundation's Step 1. The four hard constraints on the state shape (JSON-serializable / typed slices / normalized / stored-vs-derived) and *why each one* keeps a later consumer surface from breaking; the deterministic counter-in-state id-generation pattern (and why `random`/`Date.now`/`uuid` break macro/e2e/undo replay equality); the `StateAdapter` seam as its own hand-write-vs-install decision; what does NOT belong in state, with the "does a command read or write it?" test.
- **`acture-greenfield-bootstrap`** — the concrete file-by-file walk-through of the foundation's four-step sequence, grounded in the `examples/greenfield/graph-editor` worked app. The three core-primitive files in order (`state.ts` → `registry.ts` → `commands/index.ts`), the "every mutation flows through dispatch" acceptance criterion and its literal `rg` audit, the state→registry→commands→consumer ordering discipline, and the observation that the hand-write-vs-install decision recurs three times (registry, state adapter, each consumer) and must not be collapsed.

Both build on `acture-greenfield` and follow the established skill template. `acture-greenfield` updated to point at both (intro, Step 1, See also).

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.9 increment.

1. **No conditional logic in command metadata.** ✅ No `CommandRecord` change. The codemods and greenfield skills touch no metadata surface.
2. **No god-package.** ✅ No new package. `acture-codemods` stayed a single CLI; no package gained scope.
3. **No business logic in adapter packages.** ✅ The codemods CLI change is pure I/O disambiguation; the codemods themselves were untouched. The AI-codemod-recipe doc explicitly carries hard-don't #3 into the discipline an agent-authored codemod must follow ("no business logic").
4. **No `if (mode === ...)` in shared helpers.** ✅ N/A.
5. **No `eval()`-ing LLM strings.** ✅ N/A — but the greenfield skills both restate the `dispatch` → `Map.get` → fail-closed guardrail.
6. **No coupling the registry to React.** ✅ `acture-greenfield-bootstrap` explicitly states the registry is module-scope plain TS and names the Excalidraw React-bound `ActionManager` as the failure mode.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ N/A.
8. **No bundling a UI kit.** ✅ N/A.
9. **No marketing on category.** ✅ The codemods README leads with the concrete CLI; the greenfield skills lead with the concrete sequence.
10. **No assuming the LLM's chosen function is authorization.** ✅ N/A.

**Scope discipline (YAGNI + hard-don't #2).** The headline of this increment: the `.d.ts` tier mirror was *declined* on YAGNI grounds — no concrete type-level consumer, speculative. Nothing was added to `CommandRecord`; no package was created; no feature was built ahead of a named need. (See `docs/redesign_takeaways.md` §6: previous drafts invoked the "rule of three" here, which is a user-facing heuristic — not a maintainer-side gate. Same decision, correct framing.)

**Positioning check (merge-ritual #6).** `acture-codemods` is dev/build-time tooling — never a runtime dependency (the README's standing note). The AI-codemod-recipe doc is explicitly the dev-tool-first path: a one-off codemod the project owns, zero acture dependency, with installing `acture-codemods` framed as the opt-in accelerator. The greenfield skills inherit the foundation's dev-tool-first framing — the registry, the state adapter, and each consumer are each a hand-write-vs-install choice. The principle holds.

## Stat sheet

| Metric | v1.8 end | v1.9 end | Δ |
| --- | --- | --- | --- |
| Packages | 16 | 16 | 0 |
| Worked examples | 4 | 4 | 0 |
| Tests (packages) | 419 | 422 | +3 (`acture-codemods` CLI disambiguation) |
| Tests (examples) | 41 | 41 | 0 |
| Skills | 20 | 22 | +2 (`acture-greenfield-state-model`, `acture-greenfield-bootstrap`) |
| Reproducibility / recipe docs | 2 | 3 | +1 (`docs/ai-codemod-recipe.md`) |
| CommandRecord fields | 15 | 15 | 0 — closed surface still holds |
| Pending changesets | 0 | 1 | +1 (`acture-codemods` `minor`) |

CI green across the workspace: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all pass.

## Release readiness

- ✅ All 16 packages typecheck and build; 4 example apps build + pass.
- ✅ 422 package tests + 41 example tests green; hard-don'ts audit clean; positioning check passes.
- ✅ One pending changeset: `acture-codemods` `minor` (`.changeset/codemods-cli-polish.md`). `changeset status` confirms it bumps `acture-codemods` only — no cascade. `changeset version` is safe to run.
- ✅ The codemods/tier backlog file (`docs/backlog/codemods-polish-and-tier-mirror.md`) is fully closed — two items shipped, one (`.d.ts` mirror) explicitly and durably deferred with rationale.

**v1.9 is DONE.** Next session: see `docs/next_session.md`.
