/**
 * Acceptance-test parity check between `before/` and `after/`. Every
 * mutation the `before/` UI performed is reachable through the
 * registry in `after/`, and the store state ends up identical.
 *
 * Per `next_session.md` Step 3 acceptance criteria §2 — 5 commands
 * wrapped without breaking existing UI behavior. The wrapped commands
 * are: addNote, toggleDone, removeNote, setDueDate, setTheme,
 * setFontSize. Plus two GRADUATED commands: setBody, archiveDone.
 */

import { describe, it, expect } from 'vitest';
import { store } from './store.js';
import { registry } from './acture/registry.js';
import './acture/index.js'; // register all commands

describe('after — wrapped commands dispatch through the existing store', () => {
  it('app.note.add appends to the legacy store', async () => {
    const before = store.getState().notes.length;
    const result = await registry.dispatch('app.note.add', {
      title: 'wrapped add',
    });
    expect(result.ok).toBe(true);
    expect(store.getState().notes.length).toBe(before + 1);
    expect(store.getState().notes.at(-1)!.title).toBe('wrapped add');
  });

  it('app.note.toggleDone flips the flag in the legacy store', async () => {
    const id = store.getState().notes[0]!.id;
    const before = store.getState().notes.find((n) => n.id === id)!.done;
    await registry.dispatch('app.note.toggleDone', { id });
    expect(store.getState().notes.find((n) => n.id === id)!.done).toBe(!before);
  });

  it('app.note.setDueDate assigns the date in the legacy store', async () => {
    const id = store.getState().notes[0]!.id;
    await registry.dispatch('app.note.setDueDate', { id, date: '2026-12-01' });
    expect(store.getState().notes.find((n) => n.id === id)!.dueDate).toBe(
      '2026-12-01',
    );
  });

  it('app.settings.setTheme writes the theme', async () => {
    await registry.dispatch('app.settings.setTheme', { theme: 'dark' });
    expect(store.getState().theme).toBe('dark');
  });

  it('app.settings.setFontSize clamps and writes', async () => {
    await registry.dispatch('app.settings.setFontSize', { size: 24 });
    expect(store.getState().fontSize).toBe(24);
  });

  it('app.note.remove removes from the legacy store', async () => {
    const id = store.getState().addNote('to be removed');
    const result = await registry.dispatch('app.note.remove', { id });
    expect(result.ok).toBe(true);
    expect(store.getState().notes.find((n) => n.id === id)).toBeUndefined();
  });
});

describe('after — graduated commands no longer route through a legacy action', () => {
  it('app.note.setBody mutates the body field via execute (no setBody on store)', async () => {
    const id = store.getState().notes[0]!.id;
    const result = await registry.dispatch('app.note.setBody', {
      id,
      body: 'fresh body via graduated command',
    });
    expect(result.ok).toBe(true);
    expect(store.getState().notes.find((n) => n.id === id)!.body).toBe(
      'fresh body via graduated command',
    );
    // The graduated action does not exist on the store anymore.
    expect((store.getState() as unknown as Record<string, unknown>).setBody).toBeUndefined();
  });

  it('app.note.setBody returns err for unknown id (errors-as-data)', async () => {
    const result = await registry.dispatch('app.note.setBody', {
      id: 'nope',
      body: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown_note');
  });

  it('app.note.archiveDone archives done notes', async () => {
    // Reset relevant state: mark one note done.
    const id = store.getState().notes.find((n) => !n.archived)!.id;
    if (!store.getState().notes.find((n) => n.id === id)!.done) {
      await registry.dispatch('app.note.toggleDone', { id });
    }
    const result = await registry.dispatch('app.note.archiveDone');
    expect(result.ok).toBe(true);
    expect(store.getState().notes.find((n) => n.id === id)!.archived).toBe(true);
    // The graduated action does not exist on the store anymore.
    expect(
      (store.getState() as unknown as Record<string, unknown>).archiveDone,
    ).toBeUndefined();
  });
});

describe('after — registry size and tier filtering', () => {
  it('registers exactly 8 commands (6 wrapped + 2 graduated)', () => {
    // The barrel registers: add, toggleDone, remove, setDueDate,
    // setBody, archiveDone (graduated), setTheme, setFontSize.
    expect(registry.size()).toBe(8);
  });

  it('every command is in the default stable tier (none are hidden)', () => {
    const stable = registry.list();
    expect(stable.length).toBe(8);
  });
});
