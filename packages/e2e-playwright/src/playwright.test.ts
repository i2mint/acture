import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Page } from '@playwright/test';
import type { Result } from 'acture';
import {
  commandSelector,
  clickCommand,
  dispatchInPage,
  replaySequenceInPage,
  replayTestInPage,
  DEFAULT_REGISTRY_KEY,
} from './playwright.js';

/**
 * A `Page` stand-in. `evaluate` actually runs the page function against
 * `globalThis` — which is exactly what Playwright's `evaluate` does in
 * the browser (where `globalThis` is `window`). So these tests exercise
 * the real in-page bridge logic, not a stub of it.
 */
function mockPage(overrides: Partial<Page> = {}): Page {
  return {
    evaluate: vi.fn(
      async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    ),
    click: vi.fn(async () => {}),
    ...overrides,
  } as unknown as Page;
}

/** Install a fake registry on the global the bridge reads from. */
function installFakeRegistry(
  dispatch: (id: string, params?: unknown) => Promise<Result<unknown>>,
  key: string = DEFAULT_REGISTRY_KEY,
): void {
  (globalThis as Record<string, unknown>)[key] = { dispatch };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[DEFAULT_REGISTRY_KEY];
  delete (globalThis as Record<string, unknown>)['myApp.registry'];
});

describe('commandSelector', () => {
  it('builds the data-command selector', () => {
    expect(commandSelector('app.zoom.fit')).toBe('[data-command="app.zoom.fit"]');
  });
});

describe('clickCommand', () => {
  it('clicks the element wired to the command id', async () => {
    const page = mockPage();
    await clickCommand(page, 'app.zoom.fit');
    expect(page.click).toHaveBeenCalledWith('[data-command="app.zoom.fit"]');
  });
});

describe('dispatchInPage', () => {
  it('dispatches through the page registry and returns its Result', async () => {
    installFakeRegistry(async (id, params) => ({ ok: true, value: { id, params } }));
    const page = mockPage();

    const result = await dispatchInPage(page, 'app.count.set', { value: 9 });

    expect(result).toEqual({
      ok: true,
      value: { id: 'app.count.set', params: { value: 9 } },
    });
  });

  it('returns bridge_not_installed when the app has not exposed a registry', async () => {
    const page = mockPage();
    const result = await dispatchInPage(page, 'app.zoom.fit');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('bridge_not_installed');
      expect(result.error.message).toContain(DEFAULT_REGISTRY_KEY);
    }
  });

  it('honours a custom registryKey', async () => {
    installFakeRegistry(async () => ({ ok: true, value: 'custom' }), 'myApp.registry');
    const page = mockPage();

    const result = await dispatchInPage(page, 'app.x', undefined, {
      registryKey: 'myApp.registry',
    });

    expect(result).toEqual({ ok: true, value: 'custom' });
  });
});

describe('replaySequenceInPage', () => {
  it('replays a sequence through the page and reports each Result', async () => {
    const calls: string[] = [];
    installFakeRegistry(async (id) => {
      calls.push(id);
      return { ok: true, value: id };
    });
    const page = mockPage();

    const result = await replaySequenceInPage(page, [
      { commandId: 'app.a' },
      { commandId: 'app.b' },
    ]);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['app.a', 'app.b']);
  });

  it('stops on the first failure by default', async () => {
    const calls: string[] = [];
    installFakeRegistry(async (id) => {
      calls.push(id);
      return id === 'app.bad'
        ? { ok: false, error: { code: 'boom', message: 'bad' } }
        : { ok: true, value: id };
    });
    const page = mockPage();

    const result = await replaySequenceInPage(page, [
      { commandId: 'app.a' },
      { commandId: 'app.bad' },
      { commandId: 'app.c' },
    ]);

    expect(result.ok).toBe(false);
    expect(calls).toEqual(['app.a', 'app.bad']); // app.c never ran
  });
});

describe('replayTestInPage', () => {
  it('dispatches command steps and runs page assertions in order', async () => {
    installFakeRegistry(async (id) => ({ ok: true, value: id }));
    const page = mockPage();
    const seen: string[] = [];

    await replayTestInPage(page, [
      { commandId: 'app.open' },
      { assert: (p) => void seen.push(p === page ? 'got-page' : 'wrong') },
      { commandId: 'app.close' },
    ]);

    expect(seen).toEqual(['got-page']);
  });

  it('throws when a command step fails', async () => {
    installFakeRegistry(async () => ({
      ok: false,
      error: { code: 'boom', message: 'kaboom' },
    }));
    const page = mockPage();

    await expect(
      replayTestInPage(page, [{ commandId: 'app.fail' }]),
    ).rejects.toThrow(/app\.fail.*kaboom/);
  });

  it('lets a throwing page assertion propagate', async () => {
    installFakeRegistry(async (id) => ({ ok: true, value: id }));
    const page = mockPage();

    await expect(
      replayTestInPage(page, [
        { commandId: 'app.open' },
        { assert: () => { throw new Error('locator not visible'); } },
      ]),
    ).rejects.toThrow('locator not visible');
  });
});
