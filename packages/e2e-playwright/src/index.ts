/**
 * `acture-e2e-playwright` — e2e adapter for Playwright.
 *
 * Two layers, mirroring `docs/hand-written-command-sequence.md`:
 *
 *   - **The sequence engine** (`sequence.ts`) — record / compose /
 *     replay of `{commandId, params}` sequences, plus the assertion
 *     extension (`replayTest`). Pure: zero Playwright, zero React. This
 *     is the part a project can hand-write and own outright; it is
 *     re-exported here so a team that installs the package gets it
 *     tested rather than re-derived.
 *
 *   - **The Playwright glue** (`playwright.ts`) — the tool-bound layer:
 *     `dispatchInPage`, `clickCommand`, `commandSelector`,
 *     `replaySequenceInPage`, `replayTestInPage`. Playwright is imported
 *     type-only here, so this entry carries zero runtime Playwright
 *     dependency.
 *
 * The runtime Playwright `test` fixture lives in the separate
 * `acture-e2e-playwright/fixture` entry — import it only from test
 * files.
 *
 * Positioning: this package is an *optional accelerator*. An agent can
 * hand-write the sequence engine from `docs/hand-written-command-sequence.md`
 * and the Playwright glue for the project's own runner — see the
 * `acture-e2e` and `acture-macros` skills. Installing this package is a
 * deliberate, opt-in choice to reuse tested code. See `docs/positioning.md`.
 */

export {
  recordSequence,
  replaySequence,
  replayTest,
  isAssertionStep,
} from './sequence.js';
export type {
  SequenceStep,
  CommandSequence,
  Recording,
  ReplayStepResult,
  ReplayOptions,
  ReplayResult,
  AssertionStep,
  TestStep,
  TestSequence,
} from './sequence.js';

export {
  DEFAULT_REGISTRY_KEY,
  commandSelector,
  clickCommand,
  dispatchInPage,
  replaySequenceInPage,
  replayTestInPage,
} from './playwright.js';
export type {
  PageBridgeOptions,
  PageAssertionStep,
  PageTestStep,
  PageTestSequence,
} from './playwright.js';
