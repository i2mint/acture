/**
 * Build the shared registry. Hosts wire the state adapter and the
 * commands together here; React components consume the registry by
 * reference. (Per the acture-state-adapter skill: the registry is
 * plain TS and is constructed OUTSIDE React.)
 */

import { createRegistry } from 'acture';
import { state } from './state.js';
import { buildCommands } from './commands/index.js';

export const registry = createRegistry();
registry.registerAll(buildCommands(state));
