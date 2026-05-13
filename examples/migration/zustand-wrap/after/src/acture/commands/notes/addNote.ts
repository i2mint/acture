/**
 * Wrapped command: app.note.add.
 *
 * Delegates to the legacy `addNote` action on the host store. The
 * legacy action is still in place; this wrapper makes the same action
 * dispatchable from the palette / AI / MCP surfaces.
 *
 * Parameter shape (1 free-text string): deriveKind returns `handoff`
 * — form-based collection in the palette.
 */

import { z } from 'zod';
import { wrapMutation } from '@acture/migration';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const addNote = wrapMutation(
  (params: { title: string }) => store.getState().addNote(params.title),
  {
    id: 'app.note.add',
    title: 'Add note',
    category: 'Notes',
    description: 'Create a new note with the given title.',
    registry,
    params: z.object({
      title: z.string().min(1).describe('Note title'),
    }),
    logTo: null,
  },
);
