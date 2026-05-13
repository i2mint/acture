/**
 * Codemod registry, Nx-style.
 *
 * Each entry pairs a codemod name with the version of acture at which
 * it was first published. The CLI uses this to:
 *   - `--list` the catalog,
 *   - look up a codemod by name,
 *   - emit a JSON manifest for tooling (`acture-codemods --manifest`).
 *
 * Per research-4 §B.5: the v1.2 scope is two of the five planned
 * codemods. The other three (`redux-action-to-command`,
 * `usestate-mutation-to-command`, `rtk-thunk-to-command`) are tracked in
 * the manifest as `status: 'planned'` so users see what's coming.
 */

import type { Codemod } from './types.js';
import { wrapHandlerWithMutation } from './codemods/wrap-handler-with-mutation.js';
import { extractOnClickToCommand } from './codemods/extract-onclick-to-command.js';

export interface ManifestEntry {
  readonly name: string;
  readonly description: string;
  readonly status: 'shipped' | 'planned';
  readonly since?: string;
  readonly codemod?: Codemod;
}

export const MANIFEST: readonly ManifestEntry[] = [
  {
    name: wrapHandlerWithMutation.name,
    description: wrapHandlerWithMutation.description,
    status: 'shipped',
    since: '1.0.0',
    codemod: wrapHandlerWithMutation,
  },
  {
    name: extractOnClickToCommand.name,
    description: extractOnClickToCommand.description,
    status: 'shipped',
    since: '1.0.0',
    codemod: extractOnClickToCommand,
  },
  {
    name: 'redux-action-to-command',
    description:
      'Convert dispatch({ type, payload }) call sites to acture.dispatch(commandId, payload). Generates command registration alongside the slice.',
    status: 'planned',
  },
  {
    name: 'usestate-mutation-to-command',
    description:
      'Extract each setX call inside an event handler into a discrete command that mutates the same state.',
    status: 'planned',
  },
  {
    name: 'rtk-thunk-to-command',
    description:
      'Convert createAsyncThunk into an acture async command. Requires type-aware analysis.',
    status: 'planned',
  },
];

export function findCodemod(name: string): Codemod | undefined {
  const entry = MANIFEST.find((m) => m.name === name);
  return entry?.codemod;
}

export function listShipped(): readonly ManifestEntry[] {
  return MANIFEST.filter((m) => m.status === 'shipped');
}
