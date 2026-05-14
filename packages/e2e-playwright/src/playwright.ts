/**
 * The Playwright glue — the *tool-bound* layer. This is the part you
 * would not want to re-derive: dispatching commands into a live page,
 * `data-command` selectors, and the in-page registry bridge.
 *
 * Playwright is the tool choice bound here. The `acture-e2e` skill
 * documents the agent-written path and that other runners (Cypress,
 * Vitest browser mode, …) are equally valid — for those, adapt the
 * `sequence.ts` engine to the runner's page API.
 *
 * The app under test must expose its registry on the page, e.g. in a
 * test/dev build: `window.__actureRegistry = registry`. The key is
 * configurable via `registryKey`.
 *
 * Playwright is imported **type-only** here — these helpers carry zero
 * runtime Playwright dependency. The runtime import lives in
 * `./fixture`.
 */

import type { Page } from '@playwright/test';
import type { Result } from 'acture';
import type { CommandSequence, ReplayResult, SequenceStep } from './sequence.js';

/** Default `window` key the app under test exposes its registry on. */
export const DEFAULT_REGISTRY_KEY = '__actureRegistry';

export interface PageBridgeOptions {
  /** `window` key the app under test exposes its registry on.
   *  Default: `'__actureRegistry'`. */
  readonly registryKey?: string;
}

/** CSS selector for the element wired to a command id, by convention
 *  `<button data-command="app.zoom.fit">`. */
export function commandSelector(commandId: string): string {
  return `[data-command="${commandId}"]`;
}

/** Click the element wired to a command id. Drives the command through
 *  the real UI — the E2E-level adapter of the test pyramid. */
export function clickCommand(page: Page, commandId: string): Promise<void> {
  return page.click(commandSelector(commandId));
}

/**
 * Dispatch a command through the page's registry — the unit/API-level
 * adapter, but inside a real browser. Returns the registry's `Result`;
 * never throws (errors-as-data is preserved across the page boundary).
 *
 * If the app has not exposed its registry, the returned `Result` is
 * `{ ok: false, error: { code: 'bridge_not_installed' } }` — a clear,
 * actionable failure rather than an opaque `undefined`.
 */
export async function dispatchInPage<R = unknown>(
  page: Page,
  commandId: string,
  params?: unknown,
  options: PageBridgeOptions = {},
): Promise<Result<R>> {
  const registryKey = options.registryKey ?? DEFAULT_REGISTRY_KEY;
  return page.evaluate(
    async ({ key, id, p }): Promise<Result<R>> => {
      const reg = (globalThis as Record<string, unknown>)[key] as
        | { dispatch: (id: string, params?: unknown) => Promise<Result<R>> }
        | undefined;
      if (reg === undefined || typeof reg.dispatch !== 'function') {
        return {
          ok: false,
          error: {
            code: 'bridge_not_installed',
            message:
              `acture-e2e-playwright: window.${key} is not a registry. ` +
              `The app under test must expose it in a test/dev build — ` +
              `e.g. \`window.${key} = registry\`.`,
          },
        };
      }
      return reg.dispatch(id, p);
    },
    { key: registryKey, id: commandId, p: params },
  );
}

/**
 * Replay a `CommandSequence` through the page's registry. The
 * in-browser analogue of `replaySequence` — same shape of result.
 */
export async function replaySequenceInPage(
  page: Page,
  sequence: CommandSequence,
  options: PageBridgeOptions & {
    onStep?: (r: { step: SequenceStep; result: Result<unknown> }) => void;
    stopOnError?: boolean;
  } = {},
): Promise<ReplayResult> {
  const { onStep, stopOnError = true, ...bridge } = options;
  const results: { step: SequenceStep; result: Result<unknown> }[] = [];

  for (const step of sequence) {
    const result = await dispatchInPage(page, step.commandId, step.params, bridge);
    const stepResult = { step, result };
    results.push(stepResult);
    onStep?.(stepResult);
    if (!result.ok && stopOnError) break;
  }

  return { ok: results.every((r) => r.result.ok), results };
}

/** A Playwright assertion step: receives the `Page`, throws on failure.
 *  This is where `expect(page.locator(...))...` lives — the assertion
 *  inspects the rendered page, not in-memory state. */
export interface PageAssertionStep {
  readonly assert: (page: Page) => void | Promise<void>;
}

/** A Playwright test body: command steps interleaved with page
 *  assertions. The e2e shape of `TestSequence` from `sequence.ts`. */
export type PageTestStep = SequenceStep | PageAssertionStep;
export type PageTestSequence = readonly PageTestStep[];

function isPageAssertionStep(step: PageTestStep): step is PageAssertionStep {
  return 'assert' in step;
}

/**
 * Replay a Playwright test sequence: dispatch command steps through the
 * page, run page assertions in order. A failing command step or a
 * throwing assertion throws — Playwright's `test()` catches and reports.
 */
export async function replayTestInPage(
  page: Page,
  sequence: PageTestSequence,
  options: PageBridgeOptions = {},
): Promise<void> {
  for (const step of sequence) {
    if (isPageAssertionStep(step)) {
      await step.assert(page);
      continue;
    }
    const result = await dispatchInPage(page, step.commandId, step.params, options);
    if (!result.ok) {
      throw new Error(
        `Command "${step.commandId}" failed: ${result.error.message}`,
      );
    }
  }
}
