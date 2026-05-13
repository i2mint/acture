/**
 * Wrapped command: app.settings.setFontSize.
 *
 * 1 number param (slider-shaped) → deriveKind = `handoff`. Numbers are
 * NOT picker-typed in the heuristic — a form-based input is the
 * default. A host that wants an inline slider can override
 * `kind: 'atomic'` and provide a custom picker for `z.number()`.
 */

import { z } from 'zod';
import { wrapMutation } from '@acture/migration';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';

export const setFontSize = wrapMutation(
  (params: { size: number }) => store.getState().setFontSize(params.size),
  {
    id: 'app.settings.setFontSize',
    title: 'Set font size',
    category: 'Settings',
    description: 'Change the base font size (8–32px).',
    registry,
    params: z.object({
      size: z
        .number()
        .int()
        .min(8)
        .max(32)
        .describe('Font size in pixels (8–32)'),
    }),
    logTo: null,
  },
);
