import { useSyncExternalStore } from 'react';
import { store } from './store.js';
import type { TodoState } from './existing-app.js';

export function useTodoState<T>(selector: (s: TodoState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
