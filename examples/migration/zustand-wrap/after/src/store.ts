/**
 * The host's existing zustand store — identical to `before/src/store.ts`
 * EXCEPT for the two functions that have been GRADUATED:
 *
 *   - `setBody`  → no longer exported. Its body lives in
 *                  `src/acture/commands/notes/setBody.ts`'s `execute`.
 *   - `archiveDone` → same. Lives in
 *                     `src/acture/commands/notes/archiveDone.ts`.
 *
 * The UI does NOT call those graduated actions anymore — it dispatches
 * via the acture registry. Anything else (addNote, removeNote, toggleDone,
 * setDueDate, setTheme, setFontSize) is still on the store and is wrapped
 * via `wrapMutation` in `src/acture/commands/`.
 *
 * This is what the strangler-fig "midpoint" looks like: some legacy
 * actions remain (wrapped), some have been retired (graduated).
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
  setDueDate: (id: string, date: string) => void;
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
    setDueDate: (id, date) =>
      set((s) => ({
        ...s,
        notes: s.notes.map((n) => (n.id === id ? { ...n, dueDate: date } : n)),
      })),
    setTheme: (theme) => set((s) => ({ ...s, theme })),
    setFontSize: (size) =>
      set((s) => ({ ...s, fontSize: Math.max(8, Math.min(32, size)) })),
    // setBody and archiveDone have been GRADUATED — their bodies live in
    // src/acture/commands/notes/setBody.ts and archiveDone.ts respectively.
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
