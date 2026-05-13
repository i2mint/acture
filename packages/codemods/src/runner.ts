/**
 * Programmatic runner used by both the CLI and library consumers.
 *
 * Looks up a codemod in the manifest, validates the options, and invokes
 * the codemod's `run`. Returns the same `CodemodResult` shape the CLI
 * emits as JSON.
 */

import { findCodemod, MANIFEST } from './manifest.js';
import type { CodemodOptions, CodemodResult } from './types.js';

export async function runCodemod(
  name: string,
  options: CodemodOptions,
): Promise<CodemodResult> {
  const codemod = findCodemod(name);
  if (!codemod) {
    const known = MANIFEST.filter((m) => m.status === 'shipped')
      .map((m) => m.name)
      .join(', ');
    throw new Error(
      `Unknown codemod "${name}". Available: ${known || '(none shipped yet)'}`,
    );
  }
  return await codemod.run(options);
}
