/**
 * Wrapped command: app.note.setDueDate.
 *
 * 2 free-text params (id + ISO date string) → deriveKind = `handoff`
 * (a form is the right UX). The schema validates the date is a
 * non-empty string; full ISO parsing happens in the handler if needed.
 */

import { z } from 'zod';
import { wrapMutation } from '@acture/migration';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const setDueDate = wrapMutation(
  (params: { id: string; date: string }) =>
    store.getState().setDueDate(params.id, params.date),
  {
    id: 'app.note.setDueDate',
    title: 'Set due date',
    category: 'Notes',
    description: 'Assign a due date (YYYY-MM-DD) to the given note.',
    registry,
    params: z.object({
      id: z.string().describe('Note id'),
      date: z
        .string()
        .min(1)
        .describe('Due date in YYYY-MM-DD format'),
    }),
    logTo: null,
  },
);
