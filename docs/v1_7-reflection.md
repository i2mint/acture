# v1.7 Reflection

**Authored:** 2026-05-14 by the v1.7 implementing agent. All previous tests still pass; **419 package tests** (was 396 at end of v1.6; +23 from `acture-e2e-playwright`). Example tests unchanged at 41. Every package and example typechecks and builds.

v1.7 built the two least-tooled consumer surfaces — **macros** and **e2e testing** — per `docs/next_session.md`. The crux was Step 1: a design decision about whether the shared command-sequence structure should be one substrate package, two packages, or no package. That decision was settled with the user before any code was written.

## Step 1 — the design decision

Macros and e2e both reduce to *a sequence of `{commandId, params}` pairs replayed through `registry.dispatch`*; e2e adds assertions and a browser binding. The fork:

- **(A)** a shared `acture-sequence` substrate package, with macros and e2e as thin layers on top;
- **(B)** two independent packages (`acture-macros` + `acture-e2e-playwright`);
- **(C)** a hand-written reference doc for the record/compose/replay concept + only the tool-bound piece (`acture-e2e-playwright`) as a package.

**The user chose (C)**, and a second question confirmed macros ship as **pattern + skill, no package**. Three constraints all pointed the same way:

- **Rule of three.** There is no third concrete *code* caller of a shared substrate yet — only the *concept*. Building `acture-sequence` now is abstraction ahead of demand.
- **Hard-don't #2 (no god-package).** A substrate package layering macros + e2e + assertions inside it courts god-packaging; a three-package tree (`acture-sequence` ← `acture-macros` + `acture-e2e-playwright`) is heavy for one concept.
- **The journal itself.** §3.7 is explicit: "the macro layer is a thin consumer, not a new primitive." And the recorder is structurally identical to `acture-devtools`' already-shipping `instrumentRegistry`.

(C) also matches the v1.6 precedent exactly: `docs/hand-written-registry.md` made the *core primitive* reproducible as a doc rather than forcing a dependency. v1.7's `docs/hand-written-command-sequence.md` does the same for the *consumer layer that sits on it*. The two docs are siblings.

## What v1.7 shipped

### 1. `docs/hand-written-command-sequence.md` — the reproducible reference

~60 lines a project owns outright: `recordSequence` (wrap `dispatch`, accumulate steps — reversible), `replaySequence` (iterate + dispatch, errors-as-data, `stopOnError`), composition-by-array-concat, JSON persistence, and the assertion extension (`replayTest` — e2e is a macro with assertions). Zero dependencies. The "faithfulness note" commits the doc to track the package's exported shapes.

### 2. `acture-e2e-playwright` — the one new package (`@1.0.0`, `minor` changeset)

The *tool-bound* piece. Two layers, deliberately kept separate:

- **The sequence engine** (`sequence.ts`) — pure: zero Playwright, zero React. Mirrors the reference doc line-for-line, so the doc stays a faithful hand-write reference. Re-exported from the main entry so a team that installs the package gets it tested rather than re-derived.
- **The Playwright glue** (`playwright.ts`) — `dispatchInPage`, `clickCommand`, `commandSelector`, `replaySequenceInPage`, `replayTestInPage`. Playwright is imported **type-only** here — the main entry carries zero runtime Playwright dependency. The runtime `test` fixture is isolated in a separate `./fixture` entry (`fixture.ts`).

The app under test exposes its registry on the page (`window.__actureRegistry`, configurable) behind a dev/test guard; `dispatchInPage` returns an actionable `{ ok: false, error: { code: 'bridge_not_installed' } }` if it hasn't. 23 tests — the page-bridge tests run the in-page function against `globalThis`, exercising the real bridge logic without a browser.

### 3. `acture-macros` + `acture-e2e` consumer skills

Both build on `acture-consumer-integration`. `acture-macros` documents the no-package path — hand-write the engine from the reference doc — and the macro specifics (recording mutates the registry, a macro is plain data, replay routes through `dispatch`, `stopOnError` defaults true). `acture-e2e` covers the test-pyramid compilation strategy (one intent, an adapter per level), the two decisions to surface (runner choice = the user's; agent-written vs the Playwright package), and that Cypress / Vitest browser mode / other runners are equally valid agent-written choices.

### 4. Consistency updates

`acture-architecture-primer`'s eight-consumer-surface list and `acture-consumer-integration`'s per-tool table no longer mark macros/e2e "post-v1" / "planned" — they point at the shipped artifacts. `docs/roadmap.md` updated.

### 5. Changeset config fix (surfaced during wrap-up, settled with the user)

Adding the new package surfaced a pre-existing release-mechanics bug: `changeset status` reported the *entire* suite bumping to **`2.0.0` major** from `minor`-only changesets. Two compounding causes — diagnosed, then fixed with the user:

- **Peer-dependency major cascade (primary).** Every adapter declared `peerDependencies: { acture: "workspace:*" }`; Changesets' default force-majors a package whenever a peer dep bumps at all, and treats `workspace:*` as an always-out-of-range exact pin. Fix: loosened the 13 adapters' `acture` peer range to `^1.0.0` (devDependency stays `workspace:*` for local linking) and set `onlyUpdatePeerDependentsWhenOutOfRange: true` in the changeset config.
- **The `fixed` group (secondary).** Members had drifted across `1.0.0` / `1.1.0`, so the group dragged everything to a unified version. Fix: dropped the `fixed` group — every package versions independently now, which 6 of 16 already did and which matches the à-la-carte positioning. `updateInternalDependencies: "patch"` still handles the genuine core↔adapter coupling.

Also added `acture-example-redux-wrap` to the changeset `ignore` list (the only example missing from it). Full write-up: `docs/escalations.md`. `changeset status` now reports exactly the intent — `acture` 1.1.0→1.2.0, `acture-devtools` 1.0.0→1.1.0, `acture-e2e-playwright` 1.0.0→1.1.0, no major bumps, no cascade.

## What v1.7 did NOT ship

- **No `acture-sequence` / `acture-macros` package.** The Step 1 decision. A macros package can come later if the rule of three is met.
- **No DAG/branching sequences, no parallel replay, no recorder filter, no schema-version validation of saved sequences.** All named in the reference doc's "deliberately omits" section — rule of three, wait for a real caller. A linear sequence covers the overwhelming majority of macros and e2e tests.
- **No worked example app.** The package's 23 tests (including the in-page bridge exercised against `globalThis`) and the README's worked snippets carry the legibility; a full example app would have been a Playwright-runner harness for its own sake. Reconsidered if the e2e surface grows.
- **`CommandRecord` unchanged** — still closed at 15 fields. The sequence layer is composition *above* the registry; the registry stays flat (journal §3 "Macros as composition, not a third granularity").

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.7 increment.

1. **No conditional logic in command metadata.** ✅ Zero `CommandRecord` changes. A sequence is `{commandId, params}[]` — data, not metadata.
2. **No god-package.** ✅ The central decision of the session. One new package, single accelerator (the Playwright binding). The shared concept is a doc, not a package; macros is a skill, not a package. No substrate package, no three-package tree.
3. **No business logic in adapter packages.** ✅ `acture-e2e-playwright` translates: it records dispatches, replays them, bridges to a page. It makes no domain decisions — assertions are caller-supplied `(ctx|page) => void` bodies.
4. **No `if (mode === ...)` in shared helpers.** ✅ The sequence engine has no positioning-path awareness. `stopOnError` is a behavioural option, not a mode.
5. **No `eval()`-ing LLM-produced strings.** ✅ Replay routes every step through `registry.dispatch` (`Map.get` + schema validation). `dispatchInPage`'s in-page function calls `reg.dispatch(id, params)` — never reflective invocation. A sequence loaded from disk or authored by an AI gets the same validation as any dispatch.
6. **No coupling the registry to React.** ✅ `sequence.ts` is pure TS — zero React, zero Playwright. `playwright.ts` type-imports Playwright only. Runtime Playwright is isolated in `./fixture`. The unit/API-level adapter (`replayTest`) runs in plain Node.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ N/A — new package, no prior experimental surface.
8. **No bundling a UI kit.** ✅ N/A.
9. **No marketing on category.** ✅ The README leads with the concrete win ("Record, compose, and replay command sequences; an e2e test is a macro with assertions"), not an architecture pitch.
10. **No assuming the LLM's chosen function is authorization.** ✅ N/A — but note: a replayed sequence (whether AI-authored or disk-loaded) is validated step-by-step by the dispatcher, with no trusted-caller fast path.

**Positioning check (merge-ritual #6).** Could a developer get macros / e2e with zero `acture-*` dependency? **Yes** — `docs/hand-written-command-sequence.md` is the complete hand-written path for the sequence engine, and the `acture-e2e` skill documents hand-writing the runner glue for any runner. `acture-e2e-playwright` is the opt-in accelerator for teams that chose Playwright. The dev-tool-first principle holds.

## Stat sheet

| Metric | v1.6 end | v1.7 end | Δ |
| --- | --- | --- | --- |
| Packages | 15 | 16 | +1 (`acture-e2e-playwright`) |
| Worked examples | 4 | 4 | 0 |
| Tests (packages) | 396 | 419 | +23 (`acture-e2e-playwright`) |
| Tests (examples) | 41 | 41 | 0 |
| Skills | 15 | 17 | +2 (`acture-macros`, `acture-e2e`) |
| Reproducibility reference docs | 1 | 2 | +1 (`hand-written-command-sequence.md`) |
| CommandRecord fields | 15 | 15 | 0 — closed surface still holds |
| Next-release version bumps | suite-wide `2.0.0` (bug) | `acture` 1.2.0, `acture-devtools` 1.1.0, `acture-e2e-playwright` 1.1.0 | release math fixed |

CI green across the workspace: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all pass.

## Release readiness

- ✅ All 16 packages typecheck and build; 4 example apps build + pass.
- ✅ 419 package tests + 41 example tests green.
- ✅ Hard-don'ts audit clean; positioning check passes.
- ✅ Changeset release math fixed and verified — `changeset status` reports the intended `minor` bumps, no spurious majors. Two pending changesets queued for the next `changeset version`: v1.6's `tier-warnings` extraction (`acture` + `acture-devtools`) and v1.7's `acture-e2e-playwright`. `changeset version` is now safe to run.

**v1.7 is DONE.** Next session: see `docs/next_session.md` — pick the next increment from the roadmap's Deferred / backlog (the consumer-skill family is the natural continuation).
