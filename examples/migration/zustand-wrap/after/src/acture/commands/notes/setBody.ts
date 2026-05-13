/**
 * GRADUATED command: app.note.setBody.
 *
 * Used to be `wrapMutation(store.setBody, ...)`. The legacy `setBody`
 * action on the store had only one caller — the body editor in the UI
 * — and that caller was rerouted to dispatch through the registry.
 * With zero remaining call sites, the legacy action was deleted and
 * the body moved into this `execute`.
 *
 * This is exactly the workflow `migration-graduate` describes.
 */

import { z } from 'zod';
import { defineCommand, ok, err } from 'acture';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const setBody = defineCommand({
  id: 'app.note.setBody',
  title: 'Set note body',
  category: 'Notes',
  description: 'Replace the body text of the given note.',
  params: z.object({
    id: z.string().describe('Note id'),
    body: z.string().describe('New note body (multi-line allowed)'),
  }),
  execute: ({ id, body }) => {
    const found = store.getState().notes.find((n) => n.id === id);
    if (!found) return err('unknown_note', `No note with id ${id}`);
    store.setState((s) => ({
      ...s,
      notes: s.notes.map((n) => (n.id === id ? { ...n, body } : n)),
    }));
    return ok({ id });
  },
});

registry.register(setBody);
