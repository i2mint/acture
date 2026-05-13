/**
 * GRADUATED command: app.note.archiveDone.
 *
 * Originally wrapped around `store.archiveDone()`. The legacy action
 * had two callers — a "Archive done" button in `<Settings />` and a
 * test. Both were rerouted to dispatch through the registry, so the
 * legacy action was deleted and the body moved here.
 */

import { defineCommand, ok } from 'acture';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const archiveDone = defineCommand({
  id: 'app.note.archiveDone',
  title: 'Archive done notes',
  category: 'Notes',
  description:
    'Mark every done-but-not-yet-archived note as archived. Hides them from the active list.',
  execute: () => {
    const ids = store
      .getState()
      .notes.filter((n) => n.done && !n.archived)
      .map((n) => n.id);
    store.setState((s) => ({
      ...s,
      notes: s.notes.map((n) =>
        ids.includes(n.id) ? { ...n, archived: true } : n,
      ),
    }));
    return ok({ archived: ids });
  },
});

registry.register(archiveDone);
