/**
 * The single acture registry for this app. Created empty; populated by
 * importing `./commands`, which (per the migration-scaffold skill)
 * re-exports every wrapped + graduated command file for its side
 * effect.
 */

import { createRegistry } from 'acture';

export const registry = createRegistry();
