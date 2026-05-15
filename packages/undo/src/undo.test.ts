import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok, err } from 'acture';
import type { Effect } from 'acture';
import { createZustandAdapter } from 'acture-state-zustand';
import { createUndoHistory } from './undo.js';

interface CounterState {
  count: number;
  log: string[];
}

const initialState: CounterState = { count: 0, log: [] };

function setup(stateOverride?: CounterState) {
  const adapter = createZustandAdapter({
    initialState: stateOverride ?? structuredClone(initialState),
  });
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({
      id: 'app.increment',
      title: 'Increment',
      execute: () => {
        adapter.setStateWithPatches((draft) => {
          draft.count += 1;
        });
        return ok(undefined);
      },
    }),
    defineCommand({
      id: 'app.add',
      title: 'Add N',
      params: z.object({ by: z.number() }),
      execute: (params) => {
        adapter.setStateWithPatches((draft) => {
          draft.count += params.by;
        });
        return ok(undefined);
      },
    }),
    defineCommand({
      id: 'app.log',
      title: 'Log',
      params: z.object({ msg: z.string() }),
      execute: (params) => {
        adapter.setStateWithPatches((draft) => {
          draft.log.push(params.msg);
        });
        return ok(undefined);
      },
    }),
    defineCommand({
      id: 'app.fail',
      title: 'Fail',
      execute: () => err('boom', 'failed'),
    }),
    defineCommand({
      id: 'app.fail.but.mutate',
      title: 'Mutate then fail',
      execute: () => {
        adapter.setStateWithPatches((draft) => {
          draft.count += 100;
        });
        return err('partial', 'mutated then errored');
      },
    }),
    defineCommand({
      id: 'app.with.effect',
      title: 'With effect',
      execute: () => {
        adapter.setStateWithPatches((draft) => {
          draft.count += 1;
        });
        return ok(undefined, {
          effects: [{ type: 'email.send', to: 'a@b.com' }],
        });
      },
    }),
    defineCommand({
      id: 'app.two.mutations',
      title: 'Two mutations',
      execute: () => {
        adapter.setStateWithPatches((draft) => {
          draft.count += 1;
        });
        adapter.setStateWithPatches((draft) => {
          draft.log.push(`count=${draft.count}`);
        });
        return ok(undefined);
      },
    }),
  ]);
  return { adapter, registry };
}

describe('createUndoHistory — basic dispatch/undo/redo', () => {
  it('records a dispatch and undo rolls it back', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.increment');
    expect(adapter.getState().count).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    history.undo();
    expect(adapter.getState().count).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('redo re-applies a previously undone dispatch', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.increment');
    history.undo();
    history.redo();
    expect(adapter.getState().count).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undo at the bottom of the stack is a no-op returning { ok: false }', () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    expect(history.undo()).toEqual({ ok: false });
    expect(adapter.getState().count).toBe(0);
  });

  it('redo at the head of the stack is a no-op returning { ok: false }', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.increment');
    expect(history.redo()).toEqual({ ok: false });
  });
});

describe('multiple mutations and multiple dispatches', () => {
  it('multiple setStateWithPatches calls within ONE dispatch produce ONE undo entry', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.two.mutations');
    expect(adapter.getState().count).toBe(1);
    expect(adapter.getState().log).toEqual(['count=1']);
    expect(history.entries()).toHaveLength(1);
    history.undo();
    expect(adapter.getState().count).toBe(0);
    expect(adapter.getState().log).toEqual([]);
  });

  it('two dispatches produce two undo entries, undo rolls back the most recent', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.add', { by: 5 });
    await registry.dispatch('app.add', { by: 3 });
    expect(adapter.getState().count).toBe(8);
    expect(history.entries()).toHaveLength(2);
    history.undo();
    expect(adapter.getState().count).toBe(5);
    history.undo();
    expect(adapter.getState().count).toBe(0);
  });

  it('starting a new dispatch after an undo discards redo history', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.add', { by: 5 });
    await registry.dispatch('app.add', { by: 3 });
    history.undo();
    expect(history.canRedo()).toBe(true);
    await registry.dispatch('app.add', { by: 1 });
    expect(history.canRedo()).toBe(false);
    expect(history.entries()).toHaveLength(2);
    expect(adapter.getState().count).toBe(6);
  });
});

describe('limit enforcement', () => {
  it('drops oldest entries when limit is exceeded', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry, { limit: 3 });
    await registry.dispatch('app.add', { by: 1 });
    await registry.dispatch('app.add', { by: 1 });
    await registry.dispatch('app.add', { by: 1 });
    await registry.dispatch('app.add', { by: 1 });
    expect(history.entries()).toHaveLength(3);
    // count is 4. Undoing all 3 retained entries only rolls back 3 of those.
    history.undo();
    history.undo();
    history.undo();
    expect(adapter.getState().count).toBe(1);
    expect(history.canUndo()).toBe(false);
  });
});

describe('clear', () => {
  it('drops every entry, leaves state intact', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.increment');
    await registry.dispatch('app.increment');
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(adapter.getState().count).toBe(2);
  });
});

describe('transactions', () => {
  it('groups two dispatches into one undo entry', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await history.transaction(async () => {
      await registry.dispatch('app.add', { by: 2 });
      await registry.dispatch('app.add', { by: 3 });
    });
    expect(adapter.getState().count).toBe(5);
    expect(history.entries()).toHaveLength(1);
    history.undo();
    expect(adapter.getState().count).toBe(0);
  });

  it('partial-stays-applied — a throwing dispatch inside a transaction leaves prior mutations applied; the entry covers what was captured', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);

    let thrown: unknown = null;
    try {
      await history.transaction(async () => {
        await registry.dispatch('app.add', { by: 7 });
        // Force a synchronous throw inside the transaction:
        throw new Error('host bailed');
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).message).toBe('host bailed');
    // Partial mutation stays:
    expect(adapter.getState().count).toBe(7);
    // One undo entry was pushed:
    expect(history.entries()).toHaveLength(1);
    // The caller can rewind by undoing:
    history.undo();
    expect(adapter.getState().count).toBe(0);
  });

  it('nested transactions throw', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await expect(
      history.transaction(async () => {
        await history.transaction(async () => {});
      }),
    ).rejects.toThrow(/nested transactions/);
  });
});

describe('effects', () => {
  it('onEffect fires on apply, undo, and redo with the correct context', async () => {
    const { adapter, registry } = setup();
    const calls: Array<{ effect: Effect; ctx: { isUndo: boolean; isRedo: boolean } }> = [];
    const history = createUndoHistory(adapter, registry, {
      onEffect: (effect, ctx) => calls.push({ effect, ctx }),
    });
    await registry.dispatch('app.with.effect');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.ctx).toEqual({ isUndo: false, isRedo: false });
    expect(calls[0]!.effect).toMatchObject({ type: 'email.send' });

    history.undo();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.ctx).toEqual({ isUndo: true, isRedo: false });

    history.redo();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.ctx).toEqual({ isUndo: false, isRedo: true });
  });

  it('a throwing onEffect does NOT break dispatch or undo', async () => {
    // onEffect errors are now surfaced via `console.warn` (v1.13 audit).
    // Silence the spy so test output stays clean while still asserting
    // the dispatch + undo paths complete.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { adapter, registry } = setup();
      const history = createUndoHistory(adapter, registry, {
        onEffect: () => {
          throw new Error('handler boom');
        },
      });
      await registry.dispatch('app.with.effect');
      expect(adapter.getState().count).toBe(1);
      history.undo();
      expect(adapter.getState().count).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('a dispatch that returns {ok:false} contributes no effects (but its mutations DO still get a patches-only entry)', async () => {
    const { adapter, registry } = setup();
    const onEffect = vi.fn();
    const history = createUndoHistory(adapter, registry, { onEffect });
    await registry.dispatch('app.fail.but.mutate');
    expect(onEffect).not.toHaveBeenCalled();
    // mutation captured — undo rolls it back
    expect(adapter.getState().count).toBe(100);
    history.undo();
    expect(adapter.getState().count).toBe(0);
  });
});

describe('empty captures', () => {
  it('a dispatch that performed no mutation and no effect produces no entry', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.fail');
    expect(history.entries()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
  });

  it('an unknown command attempt produces no entry', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('no.such.command');
    expect(history.entries()).toHaveLength(0);
  });
});

describe('dispose', () => {
  it('restores the adapter and registry references', async () => {
    const { adapter, registry } = setup();
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.increment');
    expect(history.entries()).toHaveLength(1);

    history.dispose();
    await registry.dispatch('app.increment');
    // After dispose the wrapper no longer captures.
    expect(history.entries()).toHaveLength(1);
    expect(adapter.getState().count).toBe(2);
  });
});

describe('composition with another instrumenter', () => {
  it('plays nicely with a pre-existing dispatch wrapper installed earlier', async () => {
    const { adapter, registry } = setup();
    const observed: string[] = [];
    // Install a pre-existing observation wrapper FIRST.
    const original = registry.dispatch.bind(registry);
    (registry as { dispatch: typeof registry.dispatch }).dispatch =
      async function pre(id, params, ctx, opts) {
        observed.push(id);
        return original(id, params, ctx, opts);
      };

    // Then install undo on top.
    const history = createUndoHistory(adapter, registry);
    await registry.dispatch('app.add', { by: 4 });
    expect(observed).toEqual(['app.add']);
    expect(adapter.getState().count).toBe(4);
    history.undo();
    expect(adapter.getState().count).toBe(0);
  });
});

describe('runtime patch-capability guard', () => {
  it('throws an informative error when given a non-patch-capable adapter', () => {
    const { registry } = setup();
    // Hand-rolled plain StateAdapter (no `supportsPatches`, no
    // `setStateWithPatches`). The TS cast simulates a runtime caller
    // who bypassed the type check.
    const plainAdapter = {
      getState: () => ({ count: 0 }),
      setState: () => undefined,
      subscribe: () => () => undefined,
    } as unknown as Parameters<typeof createUndoHistory>[0];

    expect(() => createUndoHistory(plainAdapter, registry)).toThrow(
      /PatchCapableAdapter/,
    );
  });

  it('logs onEffect handler errors via console.warn instead of swallowing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { adapter, registry } = setup();
      const history = createUndoHistory(adapter, registry, {
        onEffect: () => {
          throw new Error('host-side bug');
        },
      });
      await registry.dispatch('app.with.effect');
      expect(warnSpy).toHaveBeenCalled();
      // The dispatch + capture still succeeded despite the handler error.
      expect(history.entries()).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
