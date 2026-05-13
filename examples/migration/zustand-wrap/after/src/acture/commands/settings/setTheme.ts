/**
 * Wrapped command: app.settings.setTheme.
 *
 * 1 enum param → deriveKind = `atomic`. The palette renders an inline
 * picker chain (three options) rather than a form.
 */

import { z } from 'zod';
import { wrapMutation } from '@acture/migration';
import { registry } from '../../registry.js';
import { store } from '../../../store.js';
import type { Theme } from '../../../store.js';

export const setTheme = wrapMutation(
  (params: { theme: Theme }) => store.getState().setTheme(params.theme),
  {
    id: 'app.settings.setTheme',
    title: 'Set theme',
    category: 'Settings',
    description: 'Switch the UI theme.',
    registry,
    params: z.object({
      theme: z.enum(['light', 'dark', 'system']).describe('UI theme'),
    }),
    logTo: null,
  },
);
