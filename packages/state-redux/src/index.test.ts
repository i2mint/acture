import { describe, it, expect, vi } from 'vitest';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { createReduxAdapter, wrapReduxStore } from './index.js';

interface AppState {
  count: number;
  items: string[];
}

const initial: AppState = { count: 0, items: ['a'] };

describe('acture-state-redux — createReduxAdapter', () => {
  it('exposes getState / setState / subscribe', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    expect(adapter.getState()).toEqual(initial);
    adapter.setState((s) => {
      s.count = 5;
    });
    expect(adapter.getState().count).toBe(5);
  });

  it('accepts mutate-the-draft (returns void) updaters', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    adapter.setState((s) => {
      s.items.push('b');
    });
    expect(adapter.getState().items).toEqual(['a', 'b']);
  });

  it('accepts return-a-new-object updaters', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    adapter.setState((s) => ({ ...s, count: s.count + 10 }));
    expect(adapter.getState().count).toBe(10);
  });

  it('subscribe(listener) fires with (next, previous) on state change', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    const listener = vi.fn();
    const off = adapter.subscribe(listener);
    adapter.setState((s) => {
      s.count = 1;
    });
    expect(listener).toHaveBeenCalledOnce();
    const [next, previous] = listener.mock.calls[0]!;
    expect(next.count).toBe(1);
    expect(previous.count).toBe(0);
    off();
  });

  it('setStateWithPatches produces Immer-shaped patches that round-trip', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    const { patches, inversePatches } = adapter.setStateWithPatches((draft) => {
      draft.count = 42;
    });
    expect(patches.length).toBeGreaterThan(0);
    expect(adapter.getState().count).toBe(42);
    adapter.applyPatches(inversePatches);
    expect(adapter.getState().count).toBe(0);
  });

  it('JSON.stringify(adapter.getState()) round-trips through JSON.parse', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    adapter.setState((s) => {
      s.items.push('b');
    });
    const json = JSON.stringify(adapter.getState());
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(adapter.getState());
  });

  it('supportsPatches is true (PatchCapableAdapter)', () => {
    const adapter = createReduxAdapter<AppState>({ initialState: initial });
    expect(adapter.supportsPatches).toBe(true);
  });
});

describe('acture-state-redux — wrapReduxStore', () => {
  it('treats one slice of an existing RTK store as acture state', () => {
    const counter = createSlice({
      name: 'counter',
      initialState: { count: 0 } as { count: number },
      reducers: {
        replace: (_s, action: { payload: { count: number } }) => action.payload,
      },
    });
    const store = configureStore({
      reducer: { counter: counter.reducer },
      middleware: (g) => g({ serializableCheck: false }),
    });
    const adapter = wrapReduxStore<{ counter: { count: number } }, { count: number }>(
      store as never,
      {
        select: (s) => s.counter,
        makeReplace: (next) => counter.actions.replace(next),
      },
    );
    expect(adapter.getState().count).toBe(0);
    adapter.setState((s) => {
      s.count = 7;
    });
    expect(adapter.getState().count).toBe(7);
    expect(store.getState().counter.count).toBe(7);
  });
});
