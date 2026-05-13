/**
 * `acture snapshot <config>` — load a registry config module and emit
 * a JSON snapshot of its tier-projected commands.
 *
 * The config module must default-export an acture `Registry` (or a
 * `Promise<Registry>`). v1.1 keeps loading simple:
 *
 *   - `.mjs` / `.js` (with `"type":"module"`) — load via dynamic `import()`.
 *   - `.cjs` — load via dynamic `import()` (Node honours the extension).
 *   - `.ts` / `.tsx` — also try dynamic `import()`; works under Node ≥22.6
 *     with `--experimental-strip-types`, or under `tsx` shimming. Errors
 *     surface with a hint pointing at the canonical workarounds.
 *
 * Output: JSON to stdout, OR a file when `--out <path>` is given. The
 * snapshot format is the same `Snapshot` that `compare-schemas` reads.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { snapshotRegistry } from './snapshot.js';
import type { Snapshot, SnapshotTool } from './snapshot.js';

export interface SnapshotCmdArgs {
  readonly config: string;
  readonly out?: string;
  readonly tiers?: readonly SnapshotTool['tier'][] | 'all';
}

export async function runSnapshotCmd(
  args: SnapshotCmdArgs,
  io: { stdout: (s: string) => void; stderr: (s: string) => void } = defaultIo(),
): Promise<number> {
  const abs = isAbsolute(args.config) ? args.config : resolve(process.cwd(), args.config);
  let mod: { default?: unknown };
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    io.stderr(
      `acture snapshot: failed to load config "${args.config}": ${(e as Error).message}\n` +
        hintForLoadError(args.config) +
        '\n',
    );
    return 2;
  }
  let registry = (mod as { default?: unknown }).default;
  if (registry !== undefined && registry !== null && typeof (registry as { then?: unknown }).then === 'function') {
    registry = await (registry as Promise<unknown>);
  }
  if (!registry || typeof (registry as { dispatch?: unknown }).dispatch !== 'function') {
    io.stderr(
      `acture snapshot: config "${args.config}" did not default-export a Registry. ` +
        'Export the registry as `export default registry;`.\n',
    );
    return 2;
  }

  const snap: Snapshot = snapshotRegistry(
    registry as Parameters<typeof snapshotRegistry>[0],
    args.tiers !== undefined ? { tiers: args.tiers } : {},
  );
  const json = JSON.stringify(snap, null, 2);

  if (args.out) {
    const outAbs = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out);
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, json + '\n', 'utf8');
    io.stdout(`snapshot written to ${args.out}\n`);
  } else {
    io.stdout(json + '\n');
  }
  return 0;
}

function hintForLoadError(path: string): string {
  if (/\.tsx?$/.test(path)) {
    return (
      '  TypeScript hint: either compile the config to .mjs first, or run\n' +
      '    npx tsx node_modules/.bin/acture snapshot ' + path + '\n' +
      '  or use Node ≥22.6 with --experimental-strip-types.'
    );
  }
  return '';
}

function defaultIo(): { stdout: (s: string) => void; stderr: (s: string) => void } {
  return {
    stdout: (s) => { process.stdout.write(s); },
    stderr: (s) => { process.stderr.write(s); },
  };
}
