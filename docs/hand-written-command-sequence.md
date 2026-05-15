# The hand-written command sequence — a reproducible reference

**Status:** reference artifact. This document makes acture's dev-tool-first
promise true for the **command-sequence** concept: a developer can record,
compose, and replay sequences of `{commandId, params}` pairs with **zero
`acture-*` dependency**, by hand-writing the ~60-line layer below.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. Read
[`docs/hand-written-registry.md`](hand-written-registry.md) too: this doc is its
sibling. That one makes the *registry primitive* reproducible; this one makes the
*consumer layer that sits on top of it* — macros and e2e tests — reproducible.

---

## Why this is a doc, not a package

A macro is "a serializable list of `{commandId, params}` pairs" and a macro
recorder "listens to command dispatches, records the sequence, and persists it"
(journal article §3.7). The journal is explicit: **the macro layer is a thin
consumer, not a new primitive.** An end-to-end test is the same thing with
assertions interleaved (§3.4, §3.7: "an end-to-end test is a macro with
assertions").

So there is no `acture-sequence` or `acture-macros` package. The record /
compose / replay layer is small enough, and stable enough, that the right
delivery is *this reference* — an agent adapts it into the target project, which
owns every line. The only thing that earns a package is the **tool-bound** piece:
`acture-e2e-playwright`, the glue between this layer and Playwright. Everything
else here, you hand-write.

| | Hand-write (this doc) | `acture-e2e-playwright` |
| --- | --- | --- |
| Record / compose / replay | yes — the code below | yes — the same shapes, re-exported |
| Dependency added | none | one (`acture-e2e-playwright` + `@playwright/test` peer) |
| Playwright page-bridge, fixtures, `data-command` selectors | hand-write the glue you need | tested, for free |
| Other runners (Cypress, Vitest browser, …) | adapt the replay engine to your runner | not covered — hand-write, this doc is the reference |

---

## The minimal command-sequence layer

This is complete. Copy it into the target project (e.g.
`src/command-sequence.ts`), adapt the names, delete what the project doesn't
need. It depends only on the registry shape — nothing imported from acture.

```ts
/* ── The sequence shape ─────────────────────────────────────────────── */

/** One step: a command id plus the params it was dispatched with.
 *  This is the entire macro format — a sequence is an array of these. */
export interface SequenceStep {
  readonly commandId: string;
  readonly params?: unknown;
}

/** A macro / workflow / test body, before assertions. Just data —
 *  JSON-serializable, inspectable, diffable. */
export type CommandSequence = readonly SequenceStep[];

/* ── Recording: observe dispatch, accumulate steps ──────────────────── */

/** Minimal registry shape this layer needs. Both the hand-written
 *  registry and `acture` core's `Registry` satisfy it. */
interface DispatchingRegistry {
  dispatch(id: string, params?: unknown, ctx?: unknown): Promise<unknown>;
}

export interface Recording {
  /** The steps captured so far. Read it after `stop()` to persist. */
  readonly steps: CommandSequence;
  /** Restore the registry's original `dispatch`. Idempotent. */
  stop(): void;
}

/**
 * Wrap `registry.dispatch` to append every call to a step list.
 * Structurally identical to `acture-devtools`' `instrumentRegistry` —
 * a recorder is just an instrument that keeps `{commandId, params}`.
 *
 * The wrapper is opt-in and reversible: `stop()` puts the original
 * `dispatch` back. Never ship a recorder wrapping a production registry.
 */
export function recordSequence(registry: DispatchingRegistry): Recording {
  const steps: SequenceStep[] = [];
  const original = registry.dispatch.bind(registry);

  registry.dispatch = async (id, params, ctx) => {
    const result = await original(id, params, ctx);
    steps.push({ commandId: id, params });
    return result;
  };

  return {
    steps,
    stop() {
      registry.dispatch = original;
    },
  };
}

/* ── Composing: sequences are arrays — compose with array ops ────────── */

/** A macro is composed by concatenation. No special API needed:
 *  `const onboarding = [...createProject, ...inviteTeam, ...openDashboard];`
 *  Author by hand just as freely:
 *  `const macro: CommandSequence = [{ commandId: 'app.zoom.fit' }];` */

/* ── Replaying: iterate and dispatch ────────────────────────────────── */

export interface ReplayStepResult {
  readonly step: SequenceStep;
  /** The registry's `Result` for this step. `ok: false` if it failed. */
  readonly result: { ok: boolean; [k: string]: unknown };
}

export interface ReplayOptions {
  /** Context passed to every `dispatch`. */
  readonly ctx?: unknown;
  /** Called after each step — for progress UI, logging, a test reporter. */
  readonly onStep?: (r: ReplayStepResult) => void;
  /** Stop replay on the first failing step. Default: true. A macro
   *  player usually wants true; a "best effort" batch may want false. */
  readonly stopOnError?: boolean;
}

export interface ReplayResult {
  readonly ok: boolean;
  readonly results: readonly ReplayStepResult[];
}

/**
 * Replay a sequence through the registry, step by step. Returns every
 * step's `Result` — never throws (dispatch is errors-as-data, and this
 * layer keeps that contract).
 */
export async function replaySequence(
  registry: DispatchingRegistry,
  sequence: CommandSequence,
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const { ctx, onStep, stopOnError = true } = options;
  const results: ReplayStepResult[] = [];

  for (const step of sequence) {
    const result = (await registry.dispatch(
      step.commandId,
      step.params,
      ctx,
    )) as ReplayStepResult['result'];
    const stepResult: ReplayStepResult = { step, result };
    results.push(stepResult);
    onStep?.(stepResult);
    if (!result.ok && stopOnError) break;
  }

  return { ok: results.every((r) => r.result.ok), results };
}

/* ── Persistence: it's already JSON ─────────────────────────────────── */

/** A sequence is plain data — `JSON.stringify(recording.steps)` to
 *  save, `JSON.parse(...)` to load. No serializer to write. The day
 *  the project versions its command schemas, a saved sequence can be
 *  validated against the current registry (journal §3 "Macros remain
 *  valid") — but that check is additive; add it when you need it. */
```

That's the whole consumer layer. ~60 lines, zero dependencies, owned by the
project. Macros are *done* — `recordSequence` + `replaySequence` is a working
record/replay tool.

---

## The assertion extension — e2e is a macro with assertions

An e2e test is this same sequence with **assertions interleaved between steps**.
That's a small, additive extension — not a separate machine:

```ts
/** A test body is a sequence with assertions mixed in. An assertion
 *  step inspects state (or the page) and throws if the expectation
 *  fails — exactly how `expect(...)` already behaves. */
export type AssertionStep = {
  readonly assert: (ctx: unknown) => void | Promise<void>;
};
export type TestStep = SequenceStep | AssertionStep;
export type TestSequence = readonly TestStep[];

const isAssertion = (s: TestStep): s is AssertionStep => 'assert' in s;

/**
 * Replay a test sequence: dispatch command steps, run assertion steps
 * in order. An assertion throwing fails the test — let it propagate to
 * the test runner (Vitest, Playwright's `test()`, etc.), which is built
 * to catch and report it.
 */
export async function replayTest(
  registry: DispatchingRegistry,
  sequence: TestSequence,
  ctx?: unknown,
): Promise<void> {
  for (const step of sequence) {
    if (isAssertion(step)) {
      await step.assert(ctx);
      continue;
    }
    const result = (await registry.dispatch(
      step.commandId,
      step.params,
      ctx,
    )) as { ok: boolean; error?: { message?: string } };
    if (!result.ok) {
      throw new Error(
        `Command "${step.commandId}" failed: ${result.error?.message ?? 'unknown'}`,
      );
    }
  }
}
```

The same `TestSequence` runs at every level of the test pyramid (journal §3.4)
— only the *adapter* changes:

- **Unit / API level** — `replayTest(registry, sequence)` against a real or
  mocked store. No UI. This is the code above, as-is.
- **Component level** — wrap `dispatch` so command steps are driven through a
  rendered component (`userEvent.click` on the element carrying the command id).
- **E2E level** — drive the steps through a real browser. The command ids map to
  `[data-command="..."]` attributes, or the page exposes the registry on
  `window` and the test calls `dispatch` in-page. This is the tool-bound layer —
  hand-write the glue for your runner, or install `acture-e2e-playwright` if your
  runner is Playwright.

The *intent* (the `TestSequence`) is written once; the *execution mechanism*
varies by adapter. That is the whole value of testing through the command layer.

---

## Why each piece is shaped this way

- **A sequence is plain data — an array of `{commandId, params}`.** Not a class,
  not a registry entry type. Composition happens *above* the registry (journal
  §3 "Macros as composition, not a third granularity"); the registry stays flat.
  Plain data is inspectable, diffable, JSON-serializable, and AI-authorable — an
  AI composing a multi-step response is emitting exactly this shape.

- **The recorder wraps `dispatch`, and `stop()` unwraps it.** Same mechanism as
  `acture-devtools`' `instrumentRegistry`. Recording is *observation*, reversible
  and opt-in — never a permanent registry mutation, never in a production build.

- **Replay never throws — it returns every step's `Result`.** The registry's
  dispatch is errors-as-data; this layer keeps that contract. A caller branches
  on `result.ok`. The *test* runner (`replayTest`) is the one place a throw is
  correct — because that is the protocol every test framework already speaks.

- **Replay routes through `registry.dispatch` — never reflective invocation.** A
  recorded sequence is a list of *strings and params*. It is replayed by `dispatch`
  doing its normal `Map.get` + schema-validate. A sequence loaded from disk, or
  authored by an AI, gets the same validation as any other dispatch — an unknown
  `commandId` returns `{ ok: false }` and nothing runs. Do not `eval` a step.

- **`stopOnError` defaults to true.** A macro is a unit — if step 3 fails, step 4
  usually shouldn't run against the broken state. A best-effort batch can opt out.

- **Assertions are just `(ctx) => void` that throw.** No assertion DSL, no
  matcher library bundled. The project's existing `expect` *is* the assertion
  step body. e2e stays "a macro with assertions" — not a new framework.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears in your project,
not for a hypothetical:

- **Schema-version validation of saved sequences.** Journal §3 notes a saved
  macro can be checked against current command schemas. Additive — wire it up
  when the project actually versions command schemas and actually persists
  sequences long enough to drift.
- **A DAG / branching sequence.** The handoff and journal both say "sequence (or
  DAG)". A linear sequence covers macros and linear e2e tests — the overwhelming
  majority. Reach for a DAG only with concrete branching workflows in hand.
- **Parallel / concurrent step execution.** Replay is sequential because a macro
  is a reproduction of something a user did in order. Don't parallelize without
  a concrete caller that needs it.
- **A recorder filter (record only `tier: 'stable'`, only user-initiated, …).**
  Easy to add to `recordSequence` — a `filter?: (step) => boolean` option. Add
  the option when a second caller wants a different filter, not before.

When you add the e2e *browser* surface, follow the `acture-e2e` skill — the
same dev-tool-first choice applies: hand-write the runner glue, or install
`acture-e2e-playwright`, as a deliberate per-project decision.

---

## Faithfulness note

The shapes here are deliberately the shapes `acture-e2e-playwright` exports —
`SequenceStep`, `CommandSequence`, `recordSequence`, `replaySequence`,
`TestSequence`, `replayTest`. An agent that hand-writes from this doc and later
installs the package finds the migration mechanical. If the package's contract
changes, this doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- [`docs/hand-written-registry.md`](hand-written-registry.md) — the sibling reference for the registry primitive this layer sits on.
- `acture-macros` skill — walks an agent through using this reference for record/replay in a target project.
- `acture-e2e` skill — the same, for e2e testing; covers the `acture-e2e-playwright` package and other runners.
- `acture-consumer-integration` skill — the per-consumer hand-write-vs-install choice.
- `docs/command_dispatch_journal_article.md` §3.4, §3.7 — "an end-to-end test is a macro with assertions".
</content>
</invoke>
