/**
 * Wrapped command: app.note.remove.
 */

import { z } from 'zod';
import { wrapMutation } from 'acture-migration';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const removeNote = wrapMutation(
  (params: { id: string }) => store.getState().removeNote(params.id),
  {
    id: 'app.note.remove',
    title: 'Remove note',
    category: 'Notes',
    registry,
    params: z.object({
      id: z.string().describe('Note id'),
    }),
    logTo: null,
  },
);
