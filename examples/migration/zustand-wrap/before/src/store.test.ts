import { describe, it, expect, beforeEach } from 'vitest';
import { createNotesStore } from './store.js';

describe('notes store (before)', () => {
  let store: ReturnType<typeof createNotesStore>;
  beforeEach(() => {
    store = createNotesStore();
  });

  it('seeds two notes', () => {
    expect(store.getState().notes).toHaveLength(2);
  });

  it('addNote returns the new id and appends to the list', () => {
    const id = store.getState().addNote('test');
    expect(id).toMatch(/^n\d+$/);
    expect(store.getState().notes.at(-1)!.title).toBe('test');
  });

  it('toggleDone flips the flag', () => {
    const before = store.getState().notes[0]!.done;
    store.getState().toggleDone('n1');
    expect(store.getState().notes[0]!.done).toBe(!before);
  });

  it('setFontSize clamps to [8, 32]', () => {
    store.getState().setFontSize(100);
    expect(store.getState().fontSize).toBe(32);
    store.getState().setFontSize(0);
    expect(store.getState().fontSize).toBe(8);
  });

  it('archiveDone marks done notes as archived and returns their ids', () => {
    store.getState().toggleDone('n1');
    const ids = store.getState().archiveDone();
    expect(ids).toEqual(['n1']);
    expect(store.getState().notes.find((n) => n.id === 'n1')!.archived).toBe(true);
  });
});
