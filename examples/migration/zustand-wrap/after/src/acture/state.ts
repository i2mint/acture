/**
 * Wrap the existing host store as a `PatchCapableAdapter<NotesState>`.
 * This is the SAME store the legacy UI reads/writes — no parallel state.
 */

import { wrapZustandStore } from 'acture-state-zustand';
import { store } from '../store.js';

export const state = wrapZustandStore(store);
