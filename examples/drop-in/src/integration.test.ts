import { describe, it, expect } from 'vitest';
import { registry } from './registry.js';
import { store } from './store.js';

describe('drop-in: registry dispatch flows through to the existing store', () => {
  it('app.todo.add dispatch adds to the existing store', async () => {
    const before = store.getState().todos.length;
    const result = await registry.dispatch('app.todo.add', { text: 'New from acture' });
    expect(result.ok).toBe(true);
    expect(store.getState().todos.length).toBe(before + 1);
    expect(store.getState().todos.at(-1)!.text).toBe('New from acture');
  });

  it('app.todo.toggle toggles the existing store', async () => {
    const id = store.getState().todos[0]!.id;
    const before = store.getState().todos[0]!.done;
    await registry.dispatch('app.todo.toggle', { id });
    expect(store.getState().todos.find((t) => t.id === id)!.done).toBe(!before);
  });

  it('errors-as-data: unknown todo id returns err', async () => {
    const result = await registry.dispatch('app.todo.toggle', { id: 'no-such' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown_todo');
  });
});
