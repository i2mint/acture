/**
 * The existing-app store, instantiated. Imported by both the existing
 * UI and (via the wrapper adapter below) the acture bolt-on.
 *
 * This is the seam: nothing about the existing store changes. The
 * acture adapter wraps the SAME store; both the legacy components and
 * the new palette / hotkeys / MCP surfaces read and write through one
 * source of truth.
 */

import { wrapZustandStore } from '@acture/state-zustand';
import { createExistingStore } from './existing-app.js';
import type { TodoState } from './existing-app.js';

export const store = createExistingStore();
export const actureState = wrapZustandStore<TodoState>(store);
export type { TodoState };
