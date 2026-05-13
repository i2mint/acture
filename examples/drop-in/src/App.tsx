import { useEffect, useState } from 'react';
import { CommandPalette } from '@acture/palette-react';
import { useHotkeys } from '@acture/hotkeys/react';
import { registry } from './registry.js';
import { store } from './store.js';
import { useTodoState } from './use-store.js';

/**
 * The legacy UI — unchanged from the existing app. It dispatches
 * directly against the existing zustand store (the "before"
 * interaction surface). The acture palette runs alongside it as a
 * second surface, sharing the same store via `actureState`.
 */
function TodoList(): React.ReactElement {
  const todos = useTodoState((s) => s.todos);
  return (
    <ul className="todos">
      {todos.map((t) => (
        <li key={t.id} className={t.done ? 'done' : ''}>
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => store.getState().toggleTodo(t.id)}
          />
          <span>{t.text}</span>
          <button onClick={() => store.getState().removeTodo(t.id)}>×</button>
        </li>
      ))}
    </ul>
  );
}

function NewTodoForm(): React.ReactElement {
  const [text, setText] = useState('');
  return (
    <form
      className="new-todo"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() === '') return;
        store.getState().addTodo(text);
        setText('');
      }}
    >
      <input
        placeholder="Add a todo…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit">Add</button>
    </form>
  );
}

/**
 * The drop-in bolt-on. Two new pieces:
 *   1. <PaletteOverlay /> — Ctrl/Cmd+K opens a palette.
 *   2. useHotkeys(registry) — `$mod+Shift+1` / `$mod+Shift+c` dispatch
 *      through the registry.
 *
 * Both reach the same store the legacy UI uses, via `actureState`
 * (which wraps the existing store). No legacy code was rewritten.
 */
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
        <CommandPalette
          registry={registry}
          onDispatched={() => setOpen(false)}
        />
      </div>
    </div>
  );
}

export function App(): React.ReactElement {
  useHotkeys(registry);
  return (
    <div className="app">
      <header>
        <h1>drop-in todo · acture bolt-on</h1>
        <p>
          The existing UI keeps working. <kbd>⌘K</kbd> for the palette;{' '}
          <kbd>⌘⇧1</kbd> toggles the first todo; <kbd>⌘⇧C</kbd> clears done.
        </p>
      </header>
      <NewTodoForm />
      <TodoList />
      <PaletteOverlay />
    </div>
  );
}
