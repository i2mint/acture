/**
 * The Playwright test fixture — the *runtime* Playwright entry point.
 *
 *     import { test, expect } from 'acture-e2e-playwright/fixture';
 *
 *     test('zoom-to-fit works from the palette', async ({ commands }) => {
 *       const result = await commands.dispatch('app.zoom.fit');
 *       expect(result.ok).toBe(true);
 *     });
 *
 * Configure the registry key per-project in `playwright.config.ts`:
 *
 *     use: { registryKey: 'myApp.registry' }
 *
 * This file is the only one in the package that imports `@playwright/test`
 * at runtime. The `sequence` engine and the page-bridge helpers in the
 * main entry are Playwright-free — see `acture-e2e-playwright` (`.`).
 */

import { test as base } from '@playwright/test';
import type { Result } from 'acture';
import {
  clickCommand,
  commandSelector,
  DEFAULT_REGISTRY_KEY,
  dispatchInPage,
  replaySequenceInPage,
  replayTestInPage,
} from './playwright.js';
import type { PageBridgeOptions, PageTestSequence } from './playwright.js';
import type { CommandSequence, ReplayResult } from './sequence.js';

/** Command bridge bound to the test's `page`. Provided by the
 *  `commands` fixture. */
export interface CommandBridge {
  /** Dispatch a command through the page's registry. */
  dispatch(commandId: string, params?: unknown): Promise<Result<unknown>>;
  /** Replay a recorded / composed `CommandSequence` through the page. */
  replay(sequence: CommandSequence): Promise<ReplayResult>;
  /** Replay a test sequence: command steps + page assertions, in order. */
  replayTest(sequence: PageTestSequence): Promise<void>;
  /** Click the element wired to a command id (`[data-command="..."]`). */
  click(commandId: string): Promise<void>;
  /** The `[data-command="..."]` selector for a command id. */
  selector(commandId: string): string;
}

export interface ActureFixtures {
  /** Configurable option: the `window` key the app under test exposes
   *  its registry on. Set it in `playwright.config.ts` via
   *  `use: { registryKey: '...' }`. Default: `'__actureRegistry'`. */
  registryKey: string;
  /** The command bridge, bound to the current `page`. */
  commands: CommandBridge;
}

/** Playwright `test` extended with the acture `commands` fixture and the
 *  `registryKey` option. Drop-in replacement for `@playwright/test`'s
 *  `test`. */
export const test = base.extend<ActureFixtures>({
  registryKey: [DEFAULT_REGISTRY_KEY, { option: true }],
  commands: async ({ page, registryKey }, use) => {
    const bridge: PageBridgeOptions = { registryKey };
    await use({
      dispatch: (commandId, params) =>
        dispatchInPage(page, commandId, params, bridge),
      replay: (sequence) => replaySequenceInPage(page, sequence, bridge),
      replayTest: (sequence) => replayTestInPage(page, sequence, bridge),
      click: (commandId) => clickCommand(page, commandId),
      selector: commandSelector,
    });
  },
});

export { expect } from '@playwright/test';
