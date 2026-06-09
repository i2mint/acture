import { describe, expect, it, vi } from 'vitest';

import { createInProcessRunner } from './in-process-runner.js';
import type { ExtensionModule } from './runner.js';

describe('createInProcessRunner', () => {
  it('activates an extension with the host bridge and reports it loaded', async () => {
    const activate = vi.fn(() => ({}));
    const module: ExtensionModule = { activate };
    const bridge = { dispatch: () => {} };
    const runner = createInProcessRunner();

    const result = await runner.load({ id: 'acme.csv', module }, bridge);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('acme.csv');
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(bridge);
    expect(runner.loaded()).toEqual(['acme.csv']);
  });

  it('passes undefined bridge through when none is given', async () => {
    const activate = vi.fn(() => undefined);
    const runner = createInProcessRunner();

    await runner.load({ id: 'a', module: { activate } });

    expect(activate).toHaveBeenCalledWith(undefined);
  });

  it('rejects a duplicate load as data, not by throwing', async () => {
    const runner = createInProcessRunner();
    const module: ExtensionModule = { activate: () => ({}) };
    await runner.load({ id: 'dup', module });

    const second = await runner.load({ id: 'dup', module });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('already_loaded');
    expect(runner.loaded()).toEqual(['dup']); // still only one
  });

  it('disposes by running deactivate and forgetting the extension', async () => {
    const deactivate = vi.fn();
    const runner = createInProcessRunner();
    await runner.load({ id: 'x', module: { activate: () => ({ deactivate }) } });

    const result = await runner.dispose('x');

    expect(result.ok).toBe(true);
    expect(deactivate).toHaveBeenCalledOnce();
    expect(runner.loaded()).toEqual([]);
  });

  it('disposes an extension that returned no handle', async () => {
    const runner = createInProcessRunner();
    await runner.load({ id: 'void', module: { activate: () => undefined } });

    const result = await runner.dispose('void');

    expect(result.ok).toBe(true);
    expect(runner.loaded()).toEqual([]);
  });

  it('returns not_loaded when disposing an unknown id', async () => {
    const runner = createInProcessRunner();

    const result = await runner.dispose('nope');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_loaded');
  });

  it('captures an activate throw as activate_threw and stays unloaded', async () => {
    const runner = createInProcessRunner();
    const module: ExtensionModule = {
      activate: () => {
        throw new Error('boom');
      },
    };

    const result = await runner.load({ id: 'bad', module });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('activate_threw');
      expect(result.error.message).toBe('boom');
    }
    expect(runner.loaded()).toEqual([]); // never registered
  });

  it('captures a deactivate throw but still forgets the extension', async () => {
    const runner = createInProcessRunner();
    await runner.load({
      id: 'leaky',
      module: {
        activate: () => ({
          deactivate: () => {
            throw new Error('teardown failed');
          },
        }),
      },
    });

    const result = await runner.dispose('leaky');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('deactivate_threw');
    expect(runner.loaded()).toEqual([]); // removed regardless — can reload
  });

  it('loads from an import thunk, unwrapping a default export', async () => {
    const activate = vi.fn(() => ({}));
    const runner = createInProcessRunner();

    const result = await runner.load({
      id: 'lazy',
      import: () => Promise.resolve({ default: { activate } }),
    });

    expect(result.ok).toBe(true);
    expect(activate).toHaveBeenCalledOnce();
  });

  it('loads from an import thunk that resolves a bare module', async () => {
    const activate = vi.fn(() => ({}));
    const runner = createInProcessRunner();

    const result = await runner.load({
      id: 'lazy2',
      import: () => Promise.resolve({ activate }),
    });

    expect(result.ok).toBe(true);
    expect(activate).toHaveBeenCalledOnce();
  });

  it('captures a failing import thunk as load_failed', async () => {
    const runner = createInProcessRunner();

    const result = await runner.load({
      id: 'missing',
      import: () => Promise.reject(new Error('404')),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('load_failed');
      expect(result.error.message).toBe('404');
    }
    expect(runner.loaded()).toEqual([]);
  });

  it('tracks multiple extensions in load order and lets a disposed id reload', async () => {
    const runner = createInProcessRunner();
    const mod: ExtensionModule = { activate: () => ({}) };

    await runner.load({ id: 'one', module: mod });
    await runner.load({ id: 'two', module: mod });
    expect(runner.loaded()).toEqual(['one', 'two']);

    await runner.dispose('one');
    expect(runner.loaded()).toEqual(['two']);

    const reload = await runner.load({ id: 'one', module: mod });
    expect(reload.ok).toBe(true);
    expect(runner.loaded()).toEqual(['two', 'one']);
  });
});
