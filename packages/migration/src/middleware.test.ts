import { describe, it, expect, vi } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import { actureMiddleware, type ReduxAction, type ReduxStoreLike } from './middleware.js';

function buildHarness(...middlewareArgs: Parameters<typeof actureMiddleware>) {
  const middleware = actureMiddleware(...middlewareArgs);
  const store = { dispatch: (a: ReduxAction) => a, getState: () => ({}) } as ReduxStoreLike<unknown>;
  const next = vi.fn((a: ReduxAction) => a);
  const dispatch = middleware(store)(next);
  return { dispatch, next };
}

describe('actureMiddleware', () => {
  it('passes the action through to next(action) unchanged', () => {
    const registry = createRegistry();
    const { dispatch, next } = buildHarness(registry);
    const action: ReduxAction = { type: 'todo.add', payload: { text: 'x' } };
    const result = dispatch(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(result).toEqual(action);
  });

  it('fires onDispatch when action.type matches a registered command', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'todo.add', title: 'Add', execute: () => ok(1) }),
    );
    const onDispatch = vi.fn();
    const { dispatch } = buildHarness(registry, { onDispatch });
    dispatch({ type: 'todo.add', payload: { text: 'x' } });
    expect(onDispatch).toHaveBeenCalledWith('todo.add', { text: 'x' });
  });

  it('does not fire onDispatch for unregistered action types by default', () => {
    const registry = createRegistry();
    const onDispatch = vi.fn();
    const { dispatch } = buildHarness(registry, { onDispatch });
    dispatch({ type: 'unknown.action', payload: null });
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('requireRegistered: false emits for any action', () => {
    const registry = createRegistry();
    const onDispatch = vi.fn();
    const { dispatch } = buildHarness(registry, {
      onDispatch,
      requireRegistered: false,
    });
    dispatch({ type: 'anything', payload: 'p' });
    expect(onDispatch).toHaveBeenCalledWith('anything', 'p');
  });

  it('custom mapping translates redux actions to command ids', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'app.todo.add', title: 'Add', execute: () => ok(1) }),
    );
    const onDispatch = vi.fn();
    const { dispatch } = buildHarness(registry, {
      onDispatch,
      mapping: (action) =>
        action.type === 'TODOS/add' ? { id: 'app.todo.add', params: action.payload } : null,
    });
    dispatch({ type: 'TODOS/add', payload: { text: 'x' } });
    expect(onDispatch).toHaveBeenCalledWith('app.todo.add', { text: 'x' });
  });

  it('mapping returning null is a skip', () => {
    const registry = createRegistry();
    const onDispatch = vi.fn();
    const { dispatch } = buildHarness(registry, {
      onDispatch,
      mapping: () => null,
    });
    dispatch({ type: 'todo.add', payload: 1 });
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('non-string action.type is ignored by default mapping', () => {
    const registry = createRegistry();
    const onDispatch = vi.fn();
    const { dispatch } = buildHarness(registry, {
      onDispatch,
      requireRegistered: false,
    });
    dispatch({ type: 123 as unknown as string });
    expect(onDispatch).not.toHaveBeenCalled();
  });
});
