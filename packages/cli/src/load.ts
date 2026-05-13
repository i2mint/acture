/**
 * Resolve a `<ref>` arg from the CLI to a parsed Snapshot. The two
 * accepted forms are:
 *
 *   1. A file path that exists on disk. Read and parsed.
 *   2. Otherwise, treat as a git ref and read `<ref>:<snapshotPath>`
 *      via `git show`.
 *
 * Both forms parse the result through `parseSnapshot`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseSnapshot, type Snapshot } from './snapshot.js';

export interface LoadOptions {
  /** Path within the repo to look for when `<ref>` is a git ref.
   *  Default: `.acture/snapshot.json`. */
  readonly snapshotPath?: string;
}

export function loadSnapshot(ref: string, options: LoadOptions = {}): Snapshot {
  const snapshotPath = options.snapshotPath ?? '.acture/snapshot.json';
  if (existsSync(ref)) {
    const raw = readFileSync(ref, 'utf8');
    return parseSnapshot(JSON.parse(raw), ref);
  }
  // Treat as git ref.
  let raw: string;
  try {
    raw = execFileSync('git', ['show', `${ref}:${snapshotPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as Error & { stderr?: Buffer | string };
    const stderr =
      typeof err.stderr === 'string'
        ? err.stderr
        : err.stderr?.toString('utf8') ?? '';
    throw new Error(
      `Could not load snapshot from "${ref}:${snapshotPath}": ${stderr.trim() || err.message}\n` +
        `Either pass a path to a snapshot JSON file, or commit a snapshot at ${snapshotPath} on the ref.`,
    );
  }
  return parseSnapshot(JSON.parse(raw), `${ref}:${snapshotPath}`);
}
