/**
 * The host UI. Renders notes, has a small form to add one, and a tiny
 * "settings" panel. Every mutation calls a store action directly.
 *
 * No imports from `acture` or `@acture/*` anywhere in this file (or in
 * the whole `before/` app). This is the starting state of a strangler-
 * fig migration.
 */

import { useState } from 'react';
import { store, useNotesStore, type Theme } from './store.js';

function NotesList(): React.ReactElement {
  const notes = useNotesStore((s) => s.notes.filter((n) => !n.archived));
  return (
    <ul className="notes">
      {notes.map((n) => (
        <li key={n.id} className={n.done ? 'done' : ''}>
          <input
            type="checkbox"
            checked={n.done}
            onChange={() => store.getState().toggleDone(n.id)}
            aria-label={`Toggle done for ${n.title}`}
          />
          <span className="title">{n.title}</span>
          {n.dueDate ? <span className="due">due {n.dueDate}</span> : null}
          <button onClick={() => store.getState().removeNote(n.id)}>×</button>
        </li>
      ))}
    </ul>
  );
}

function NewNoteForm(): React.ReactElement {
  const [title, setTitle] = useState('');
  return (
    <form
      className="new-note"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (t === '') return;
        store.getState().addNote(t);
        setTitle('');
      }}
    >
      <input
        placeholder="New note title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="New note title"
      />
      <button type="submit">Add</button>
    </form>
  );
}

function Settings(): React.ReactElement {
  const theme = useNotesStore((s) => s.theme);
  const fontSize = useNotesStore((s) => s.fontSize);
  return (
    <div className="settings">
      <label>
        Theme:{' '}
        <select
          value={theme}
          onChange={(e) => store.getState().setTheme(e.target.value as Theme)}
        >
          <option value="light">light</option>
          <option value="dark">dark</option>
          <option value="system">system</option>
        </select>
      </label>
      <label>
        Font size: {fontSize}px
        <input
          type="range"
          min={8}
          max={32}
          value={fontSize}
          onChange={(e) => store.getState().setFontSize(Number(e.target.value))}
        />
      </label>
      <button onClick={() => store.getState().archiveDone()}>
        Archive done
      </button>
    </div>
  );
}

export function App(): React.ReactElement {
  return (
    <div className="app">
      <header>
        <h1>Notes — before acture</h1>
        <p>
          A small zustand-based notes app with no acture imports anywhere.
          Run the migration skills to add a palette without touching this
          file.
        </p>
      </header>
      <NewNoteForm />
      <NotesList />
      <Settings />
    </div>
  );
}
