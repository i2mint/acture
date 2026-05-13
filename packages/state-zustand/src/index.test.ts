import { describe, it, expect, vi } from 'vitest';
import { createZustandAdapter, wrapZustandStore } from './index.js';
import { createStore } from 'zustand/vanilla';
import { isPatchCapable } from 'acture';

interface Counter {
  count: number;
  label: string;
}

describe('createZustandAdapter', () => {
  it('exposes getState / setState / subscribe', () => {
    const a = createZustandAdapter<Counter>({ initialState: { count: 0, label: 'zero' } });
    expect(a.getState()).toEqual({ count: 0, label: 'zero' });
    a.setState((s) => ({ ...s, count: s.count + 1 }));
    expect(a.getState().count).toBe(1);
  });

  it('subscribe fires with current state', () => {
    const a = createZustandAdapter<Counter>({ initialState: { count: 0, label: 'zero' } });
    const listener = vi.fn();
    const unsub = a.subscribe(listener);
    a.setState((s) => ({ ...s, count: 5 }));
    expect(listener).toHaveBeenCalled();
    const [next, prev] = listener.mock.calls[0]!;
    expect((next as Counter).count).toBe(5);
    expect((prev as Counter).count).toBe(0);
    unsub();
    a.setState((s) => ({ ...s, count: 6 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('accepts mutate-the-draft (returns void) updaters', () => {
    const a = createZustandAdapter<Counter>({ initialState: { count: 0, label: 'zero' } });
    a.setState((s) => {
      s.count = 42;
    });
    expect(a.getState().count).toBe(42);
  });

  it('reports supportsPatches via type guard', () => {
    const a = createZustandAdapter<Counter>({ initialState: { count: 0, label: 'zero' } });
    expect(isPatchCapable(a)).toBe(true);
  });

  it('setStateWithPatches produces inverse patches', () => {
    const a = createZustandAdapter<Counter>({ initialState: { count: 0, label: 'zero' } });
    const { patches, inversePatches } = a.setStateWithPatches((draft) => {
      draft.count = 7;
      draft.label = 'seven';
    });
    expect(patches.length).toBeGreaterThan(0);
    expect(inversePatches.length).toBeGreaterThan(0);
    expect(a.getState()).toEqual({ count: 7, label: 'seven' });

    a.applyPatches(inversePatches);
    expect(a.getState()).toEqual({ count: 0, label: 'zero' });
  });
});

describe('wrapZustandStore', () => {
  it('wraps an existing zustand store without breaking its API', () => {
    const store = createStore<Counter>(() => ({ count: 10, label: 'ten' }));
    const a = wrapZustandStore(store);
    expect(a.getState()).toEqual({ count: 10, label: 'ten' });
    expect(a.store).toBe(store);
  });
});

describe('integration: JSON round-trip', () => {
  it('JSON.stringify(getState()) round-trips through JSON.parse', () => {
    const a = createZustandAdapter<{ nodes: Array<{ id: string; label: string }> }>({
      initialState: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    });
    a.setStateWithPatches((draft) => {
      draft.nodes.push({ id: 'c', label: 'C' });
    });
    const json = JSON.stringify(a.getState());
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(a.getState());
  });
});
