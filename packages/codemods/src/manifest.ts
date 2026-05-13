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
import { reduxActionToCommand } from './codemods/redux-action-to-command.js';
import { useStateMutationToCommand } from './codemods/usestate-mutation-to-command.js';
import { rtkThunkToCommand } from './codemods/rtk-thunk-to-command.js';

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
    name: reduxActionToCommand.name,
    description: reduxActionToCommand.description,
    status: 'shipped',
    since: '1.1.0',
    codemod: reduxActionToCommand,
  },
  {
    name: useStateMutationToCommand.name,
    description: useStateMutationToCommand.description,
    status: 'shipped',
    since: '1.1.0',
    codemod: useStateMutationToCommand,
  },
  {
    name: rtkThunkToCommand.name,
    description: rtkThunkToCommand.description,
    status: 'shipped',
    since: '1.1.0',
    codemod: rtkThunkToCommand,
  },
];

export function findCodemod(name: string): Codemod | undefined {
  const entry = MANIFEST.find((m) => m.name === name);
  return entry?.codemod;
}

export function listShipped(): readonly ManifestEntry[] {
  return MANIFEST.filter((m) => m.status === 'shipped');
}
