/**
 * The "existing app" — a tiny todo store that knew nothing about
 * acture. This is what the drop-in path *starts from*: a host app that
 * already has its own state library and its own UI.
 *
 * In a real codebase this would be a few thousand lines across several
 * slices, hooks, and components. Here it's a single zustand vanilla
 * store with three actions.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoState {
  todos: Todo[];
  nextId: number;
  addTodo: (text: string) => string;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}

export function createExistingStore(): StoreApi<TodoState> {
  return createStore<TodoState>((set, get) => ({
    todos: [
      { id: 't1', text: 'Try acture as a drop-in', done: false },
      { id: 't2', text: 'Ship without a rewrite', done: false },
    ],
    nextId: 3,
    addTodo: (text) => {
      const id = `t${get().nextId}`;
      set((s) => ({
        ...s,
        todos: [...s.todos, { id, text, done: false }],
        nextId: s.nextId + 1,
      }));
      return id;
    },
    toggleTodo: (id) =>
      set((s) => ({
        ...s,
        todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      })),
    removeTodo: (id) =>
      set((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) })),
  }));
}
