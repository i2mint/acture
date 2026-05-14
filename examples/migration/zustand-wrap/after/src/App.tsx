/**
 * The host UI — same shape as `before/src/App.tsx` with one
 * difference: every place that wrote to the store via the graduated
 * actions (`setBody`, `archiveDone`) now goes through
 * `registry.dispatch`. Everything else still calls the legacy store
 * actions directly, which is fine — those actions are wrapped, so the
 * palette can fire them too.
 *
 * Plus: a Ctrl/Cmd+K command palette overlays the UI.
 */

import { useEffect, useState } from 'react';
import { CommandPalette } from 'acture-palette-react';
import { store, useNotesStore, type Theme } from './store.js';
import { registry } from './acture/registry.js';
import './acture/index.js'; // side-effect: registers commands

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
      {/* Graduated command — UI dispatches via the registry instead of
          calling a (now-deleted) store action. */}
      <button
        onClick={() => {
          void registry.dispatch('app.note.archiveDone');
        }}
      >
        Archive done
      </button>
    </div>
  );
}

function PaletteOverlay(): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <CommandPalette registry={registry} onDispatched={() => setOpen(false)} />
      </div>
    </div>
  );
}

export function App(): React.ReactElement {
  return (
    <div className="app">
      <header>
        <h1>Notes — after acture</h1>
        <p>
          Same notes app. <kbd>⌘K</kbd> opens the palette. Five commands
          are wrapped via `acture-migration`; two are graduated to
          direct `defineCommand` calls.
        </p>
      </header>
      <NewNoteForm />
      <NotesList />
      <Settings />
      <PaletteOverlay />
    </div>
  );
}
