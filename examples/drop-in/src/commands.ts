/**
 * The drop-in bolt-on: define commands that call into the existing
 * app's actions. The existing handlers stay where they are — every
 * command's `execute` is a thin wrapper. This is the "register existing
 * mutations as commands" pattern from the migration playbook.
 *
 * Total wiring: ~20 LOC. That's the 5-minute palette.
 */

import { z } from 'zod';
import { defineCommand, ok, err } from 'acture';
import { store } from './store.js';

export function buildCommands() {
  return [
    defineCommand({
      id: 'app.todo.add',
      title: 'Add todo',
      description: 'Append a new todo to the list.',
      category: 'Todo',
      params: z.object({ text: z.string().min(1, 'Required') }),
      execute: ({ text }) => {
        const id = store.getState().addTodo(text);
        return ok({ id, text });
      },
    }),
    defineCommand({
      id: 'app.todo.toggle',
      title: 'Toggle todo done',
      description: 'Flip the done flag on the given todo.',
      category: 'Todo',
      params: z.object({ id: z.string() }),
      execute: ({ id }) => {
        if (!store.getState().todos.some((t) => t.id === id)) {
          return err('unknown_todo', `No todo with id ${id}`);
        }
        store.getState().toggleTodo(id);
        return ok({ id });
      },
    }),
    defineCommand({
      id: 'app.todo.remove',
      title: 'Remove todo',
      category: 'Todo',
      params: z.object({ id: z.string() }),
      execute: ({ id }) => {
        store.getState().removeTodo(id);
        return ok({ id });
      },
    }),
    defineCommand({
      id: 'app.todo.clearDone',
      title: 'Clear done todos',
      description: 'Delete every todo that is marked done.',
      category: 'Todo',
      keybinding: '$mod+Shift+c',
      execute: () => {
        const ids = store
          .getState()
          .todos.filter((t) => t.done)
          .map((t) => t.id);
        for (const id of ids) store.getState().removeTodo(id);
        return ok({ removed: ids });
      },
    }),
    defineCommand({
      id: 'app.todo.toggleFirst',
      title: 'Toggle first todo',
      category: 'Todo',
      keybinding: '$mod+Shift+1',
      execute: () => {
        const first = store.getState().todos[0];
        if (!first) return err('empty', 'No todos');
        store.getState().toggleTodo(first.id);
        return ok({ id: first.id });
      },
    }),
  ];
}
