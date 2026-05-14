/**
 * The host app's existing zustand store. This file knows nothing about
 * acture. In a real project it would be hundreds of lines across many
 * slices; here it's a single store with a small notes domain.
 *
 * Three things matter for the migration demo:
 *   1. The store is created with `zustand/vanilla` so we can wrap it
 *      with `acture-state-zustand` later without changing this file.
 *   2. Actions are typed as plain methods (no Redux-action-creator
 *      ceremony).
 *   3. We use it in the React tree via the `useStore` hook below.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface Note {
  id: string;
  title: string;
  body: string;
  dueDate: string | null;
  done: boolean;
  archived: boolean;
}

export interface NotesState {
  notes: Note[];
  nextId: number;
  theme: Theme;
  fontSize: number;
  addNote: (title: string) => string;
  removeNote: (id: string) => void;
  toggleDone: (id: string) => void;
  setBody: (id: string, body: string) => void;
  setDueDate: (id: string, date: string) => void;
  archiveDone: () => string[];
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
}

export function createNotesStore(): StoreApi<NotesState> {
  return createStore<NotesState>((set, get) => ({
    notes: [
      {
        id: 'n1',
        title: 'Try the migration skills',
        body: 'Run migration-diagnose first.',
        dueDate: null,
        done: false,
        archived: false,
      },
      {
        id: 'n2',
        title: 'Ship the strangler-fig demo',
        body: '',
        dueDate: null,
        done: false,
        archived: false,
      },
    ],
    nextId: 3,
    theme: 'system',
    fontSize: 14,
    addNote: (title) => {
      const id = `n${get().nextId}`;
      set((s) => ({
        ...s,
        notes: [
          ...s.notes,
          { id, title, body: '', dueDate: null, done: false, archived: false },
        ],
        nextId: s.nextId + 1,
      }));
      return id;
    },
    removeNote: (id) =>
      set((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) })),
    toggleDone: (id) =>
      set((s) => ({
        ...s,
        notes: s.notes.map((n) =>
          n.id === id ? { ...n, done: !n.done } : n,
        ),
      })),
    setBody: (id, body) =>
      set((s) => ({
        ...s,
        notes: s.notes.map((n) => (n.id === id ? { ...n, body } : n)),
      })),
    setDueDate: (id, date) =>
      set((s) => ({
        ...s,
        notes: s.notes.map((n) => (n.id === id ? { ...n, dueDate: date } : n)),
      })),
    archiveDone: () => {
      const ids = get()
        .notes.filter((n) => n.done && !n.archived)
        .map((n) => n.id);
      set((s) => ({
        ...s,
        notes: s.notes.map((n) =>
          ids.includes(n.id) ? { ...n, archived: true } : n,
        ),
      }));
      return ids;
    },
    setTheme: (theme) => set((s) => ({ ...s, theme })),
    setFontSize: (size) =>
      set((s) => ({ ...s, fontSize: Math.max(8, Math.min(32, size)) })),
  }));
}

export const store = createNotesStore();

export function useNotesStore<T>(selector: (s: NotesState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
