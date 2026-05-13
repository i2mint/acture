/**
 * Wrapped command: app.note.toggleDone.
 *
 * 1 free-text id param → deriveKind = `handoff`. In a richer host this
 * would be an id picker; the host can override with `kind: 'atomic'` if
 * a picker is supplied.
 */

import { z } from 'zod';
import { wrapMutation } from '@acture/migration';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const toggleDone = wrapMutation(
  (params: { id: string }) => store.getState().toggleDone(params.id),
  {
    id: 'app.note.toggleDone',
    title: 'Toggle note done',
    category: 'Notes',
    description: 'Flip the done flag on the given note.',
    registry,
    params: z.object({
      id: z.string().describe('Note id'),
    }),
    logTo: null,
  },
);
