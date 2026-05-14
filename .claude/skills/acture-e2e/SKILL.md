---
name: acture-e2e
description: Build an end-to-end / integration testing consumer surface in a target project, testing through the command registry. An e2e test is a macro with assertions — a command sequence replayed with state checks. Covers the test-pyramid compilation strategy (one intent, adapters per level), the agent-written path, the optional acture-e2e-playwright package, and that Cypress / Vitest browser mode / other runners are equally valid choices. Use when adding e2e or integration tests that dispatch commands, when wiring a Playwright/Cypress suite to an acture registry, or when working ON the acture-e2e-playwright package. Triggers on "e2e", "end-to-end test", "integration test", "Playwright", "Cypress", "test through commands", "data-command", "test the registry", "command-centric testing".
---

# acture e2e — testing through the command layer

If all user actions are commands, a test is a **sequence of command dispatches plus state assertions** (journal article §3.4). An e2e test is "a macro with assertions" (§3.7) — the same `{commandId, params}` sequence as a macro, with `assert(...)` steps interleaved.

> **Load `acture-consumer-integration` first.** e2e is a consumer — this skill covers e2e specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice, the tool-library-is-the-user's-choice rule) lives there. If this is a strangler-fig adoption, also load the `migration-*` skills.

## The test pyramid is a compilation strategy

A test sequence is written **once**; only the *adapter* changes per pyramid level. The intent and assertions are shared; the execution mechanism varies.

| Level | What drives the command | Adapter |
| --- | --- | --- |
| **Unit / API** | `registry.dispatch(id, params)` directly, mocked or real state, no UI | `replayTest(registry, sequence)` from the sequence engine |
| **Component** | a UI interaction (`userEvent.click`) on a rendered component | the project's component-test setup + a thin map from interaction → command |
| **E2E** | a real browser — `[data-command="..."]` clicks, or an in-page registry bridge | `replayTestInPage(page, sequence)` / a runner fixture |

This is *not* a replacement for the test pyramid — it is a way to stop re-authoring the same intent at three levels.

## Two decisions to surface (per `acture-consumer-integration`)

### Decision 1 — the test runner (the tool-library choice — the user's)

e2e rests on a runner. Realistic choices: **Playwright**, **Cypress**, **Vitest browser mode**, WebdriverIO, a custom harness. **This choice belongs to the project, not to acture.** Name the options; respect the project's pick. acture ships one tested per-tool binding — `acture-e2e-playwright` — for projects that chose Playwright. It does not imply Playwright is the only option.

### Decision 2 — agent-written vs package-reuse (decided per the runner)

- **Agent-written** — hand-write the sequence engine from `docs/hand-written-command-sequence.md` (~60 lines, owned, zero acture dependency) plus the runner glue for the project's runner. This is the **only** path if the runner is not Playwright — the reference doc is what you adapt. Cost: the project owns and maintains the glue.
- **Package-reuse — only if the runner is Playwright** — install `acture-e2e-playwright`. It ships the same sequence engine (tested) plus the Playwright glue: `dispatchInPage`, `clickCommand`, `commandSelector`, `replaySequenceInPage`, `replayTestInPage`, and a `test` fixture (`acture-e2e-playwright/fixture`). Cost: a dev dependency to track.

Surface both; follow a stated preference if one exists; otherwise ask. Record the choice in the project's adoption notes (`acture-consumer-integration` §Step 4).

## The build — what every path produces

Whatever runner and path, the project ends up with:

1. **The sequence engine** — `recordSequence` / `replaySequence` / `replayTest` over `{commandId, params}` sequences. Hand-written from `docs/hand-written-command-sequence.md`, or imported from `acture-e2e-playwright`. This is shared with the **macros** surface — if the project already hand-wrote it for macros (`acture-macros` skill), reuse that module; do not write it twice.
2. **The page bridge** — the app exposes its registry on the page in a **test/dev build only** (`window.__actureRegistry = registry`, behind an `if (import.meta.env.DEV)` guard). The key is configurable. This is how the E2E-level adapter reaches `dispatch`.
3. **The `data-command` convention** — UI elements carry `data-command="<id>"` so a test can drive a command through the real UI (`[data-command="..."]`). Wire this where the project mounts command-bound buttons/menu items.
4. **Test sequences** — the actual tests: command steps + assertion steps. Assertions are plain `(ctx | page) => void` that throw — the project's existing `expect` is the assertion body. No assertion DSL.

## e2e specifics — what to get right

- **An e2e test IS a macro with assertions.** Do not build a separate test machine. The command-step half is the exact macro format; assertions are an additive interleave. If the project has a macros surface, e2e is that plus `assert` steps.
- **`replayTest` / `replayTestInPage` throw; `replaySequence` does not.** The sequence/replay primitives are errors-as-data (`{ ok, results }`). The *test* runners throw on a failed command step or a throwing assertion — because throwing is the protocol every test framework already speaks. Keep that split.
- **Replay routes through `dispatch` — never reflective invocation.** A test sequence is data; it is replayed by `dispatch` doing its normal `Map.get` + schema validation. (Hard-don't #5.) The in-page bridge calls `reg.dispatch(id, params)` — it never `eval`s.
- **The bridge is test/dev-only.** Exposing the registry on `window` is a test affordance. Guard it; never ship it in a production bundle.
- **Tests must not need a React renderer for unit/API level.** The registry is plain TS (hard-don't #6). `replayTest(registry, sequence)` runs in a plain Node test with zero UI. Only the E2E-level adapter needs a browser.
- **`bridge_not_installed` is a real error, not a crash.** If the app hasn't exposed its registry, `dispatchInPage` returns `{ ok: false, error: { code: 'bridge_not_installed' } }` — an actionable message, not an opaque `undefined`. Hand-written bridges should do the same.

## When working ON `acture-e2e-playwright`

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- Two layers, kept separate: the **sequence engine** (`sequence.ts`) is pure — zero Playwright, zero React — and mirrors `docs/hand-written-command-sequence.md` line-for-line so the doc stays a faithful hand-write reference. The **Playwright glue** (`playwright.ts`) type-imports Playwright only; the runtime Playwright import is isolated in `fixture.ts` (the `./fixture` entry).
- The package **translates** the registry to Playwright; it holds no business logic and makes no architectural decisions (hard-don't #3).
- `@playwright/test` is a peer dependency, framed as the user's tool choice — named, not sold.
- If you change an exported shape (`SequenceStep`, `CommandSequence`, `recordSequence`, `replaySequence`, `TestSequence`, `replayTest`), update `docs/hand-written-command-sequence.md` to match — the faithfulness note there is a standing commitment.

## What NOT to build (rule of three)

Per `docs/hand-written-command-sequence.md` §"What this reference deliberately omits": no DAG/branching test sequences, no parallel step execution, no schema-version validation of saved sequences — until a concrete caller needs it. A linear sequence covers the overwhelming majority of e2e tests.

## See also

- `docs/hand-written-command-sequence.md` — the canonical reference; the sequence engine you adapt or mirror.
- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- `acture-macros` — the same sequence engine, without assertions; share the module.
- `packages/e2e-playwright/` — the Playwright binding's source, a worked example to adapt for other runners.
- `docs/command_dispatch_journal_article.md` §3.4, §3.7 — the test-pyramid compilation strategy and "an e2e test is a macro with assertions".
