/**
 * The command-sequence engine — record / compose / replay of
 * `{commandId, params}` sequences. This file is the *owned* engine: it
 * mirrors `docs/hand-written-command-sequence.md` exactly, so a project
 * can hand-write it instead of installing this package. It is pure —
 * zero Playwright, zero React. Only `acture` core types are imported.
 *
 * A macro is a `CommandSequence`. An e2e test is a `TestSequence` — a
 * macro with assertions interleaved (journal article §3.4, §3.7).
 */

import type { Context, Registry, Result } from 'acture';

/* ── The sequence shape ─────────────────────────────────────────────── */

/** One step: a command id plus the params it was dispatched with.
 *  This is the entire macro format — a sequence is an array of these. */
export interface SequenceStep {
  readonly commandId: string;
  readonly params?: unknown;
}

/** A macro / workflow / test body, before assertions. Plain data —
 *  JSON-serializable, inspectable, diffable, AI-authorable. */
export type CommandSequence = readonly SequenceStep[];

/* ── Recording: observe dispatch, accumulate steps ──────────────────── */

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
 * `dispatch` back. Never wrap a production registry with a recorder.
 */
export function recordSequence(registry: Registry): Recording {
  const steps: SequenceStep[] = [];
  const original = registry.dispatch.bind(registry);
  let stopped = false;

  (registry as { dispatch: Registry['dispatch'] }).dispatch =
    async function recordingDispatch<R>(
      id: string,
      params?: unknown,
      ctx?: Context,
      options?: Parameters<Registry['dispatch']>[3],
    ): Promise<Result<R>> {
      const result = await original<R>(id, params, ctx, options);
      steps.push(params === undefined ? { commandId: id } : { commandId: id, params });
      return result;
    };

  return {
    steps,
    stop() {
      if (stopped) return;
      stopped = true;
      (registry as { dispatch: Registry['dispatch'] }).dispatch = original;
    },
  };
}

/* ── Composing: sequences are arrays — compose with array ops ────────── */

// A macro is composed by concatenation — no special API needed:
//   const onboarding = [...createProject, ...inviteTeam, ...openDashboard];
// Author by hand just as freely:
//   const macro: CommandSequence = [{ commandId: 'app.zoom.fit' }];

/* ── Replaying: iterate and dispatch ────────────────────────────────── */

export interface ReplayStepResult {
  readonly step: SequenceStep;
  /** The registry's `Result` for this step. `ok: false` if it failed. */
  readonly result: Result<unknown>;
}

export interface ReplayOptions {
  /** Context passed to every `dispatch`. */
  readonly ctx?: Context;
  /** Called after each step — for progress UI, logging, a test reporter. */
  readonly onStep?: (r: ReplayStepResult) => void;
  /** Stop replay on the first failing step. Default: `true`. A macro
   *  player usually wants `true`; a best-effort batch may want `false`. */
  readonly stopOnError?: boolean;
}

export interface ReplayResult {
  readonly ok: boolean;
  readonly results: readonly ReplayStepResult[];
}

/**
 * Replay a sequence through the registry, step by step. Returns every
 * step's `Result` — never throws (dispatch is errors-as-data, and this
 * engine keeps that contract).
 */
export async function replaySequence(
  registry: Registry,
  sequence: CommandSequence,
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const { ctx, onStep, stopOnError = true } = options;
  const results: ReplayStepResult[] = [];

  for (const step of sequence) {
    const result = await registry.dispatch(step.commandId, step.params, ctx);
    const stepResult: ReplayStepResult = { step, result };
    results.push(stepResult);
    onStep?.(stepResult);
    if (!result.ok && stopOnError) break;
  }

  return { ok: results.every((r) => r.result.ok), results };
}

/* ── Assertions: e2e is a macro with assertions ─────────────────────── */

/** An assertion step inspects state and throws if the expectation
 *  fails — exactly how `expect(...)` already behaves. */
export interface AssertionStep {
  readonly assert: (ctx: Context) => void | Promise<void>;
}

/** A test body is a sequence with assertions mixed in. */
export type TestStep = SequenceStep | AssertionStep;
export type TestSequence = readonly TestStep[];

/** Type guard distinguishing an assertion step from a command step. */
export function isAssertionStep(step: TestStep): step is AssertionStep {
  return 'assert' in step;
}

/**
 * Replay a test sequence: dispatch command steps, run assertion steps
 * in order. A failing command step or a throwing assertion throws —
 * which is the protocol every test runner (Vitest, Playwright's
 * `test()`, …) is built to catch and report.
 */
export async function replayTest(
  registry: Registry,
  sequence: TestSequence,
  ctx: Context = {},
): Promise<void> {
  for (const step of sequence) {
    if (isAssertionStep(step)) {
      await step.assert(ctx);
      continue;
    }
    const result = await registry.dispatch(step.commandId, step.params, ctx);
    if (!result.ok) {
      throw new Error(
        `Command "${step.commandId}" failed: ${result.error.message}`,
      );
    }
  }
}
