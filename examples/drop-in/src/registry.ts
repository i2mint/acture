import { createRegistry } from 'acture';
import { buildCommands } from './commands.js';

export const registry = createRegistry();
registry.registerAll(buildCommands());
