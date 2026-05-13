/**
 * Tests for the `acture snapshot` subcommand. We exercise both the
 * programmatic `runSnapshotCmd` helper (this file) and the CLI binary
 * (cli.test.ts) so the user-facing behavior and the underlying logic
 * are independently covered.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSnapshotCmd } from './snapshot-cmd.js';
import { parseSnapshot } from './snapshot.js';

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'acture-snap-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(name: string, source: string): string {
  const path = join(tmp, name);
  writeFileSync(path, source, 'utf8');
  return path;
}

/** Build a config that imports from the workspace `acture` package via
 *  its resolved path. We use `import.meta.resolve` to get a URL the
 *  config module can `import` regardless of the temp dir's resolution
 *  rules. */
const ACTURE_URL = new URL(
  '../../core/dist/index.js',
  import.meta.url,
).href;

const CONFIG_TEMPLATE = `
import { createRegistry, defineCommand, ok } from '${ACTURE_URL}';
const registry = createRegistry();
registry.registerAll([
  defineCommand({
    id: 'app.search',
    title: 'Search',
    description: 'Search the corpus.',
    execute: () => ok({ hits: [] }),
  }),
  defineCommand({
    id: 'app.exp',
    title: 'Exp',
    tier: 'experimental',
    execute: () => ok({}),
  }),
]);
export default registry;
`;

describe('runSnapshotCmd', () => {
  it('emits a snapshot to stdout when --out is not provided', async () => {
    const config = writeConfig('config-stdout.mjs', CONFIG_TEMPLATE);
    let stdout = '';
    const code = await runSnapshotCmd(
      { config },
      { stdout: (s) => { stdout += s; }, stderr: () => {} },
    );
    expect(code).toBe(0);
    const snap = parseSnapshot(JSON.parse(stdout), 'stdout');
    expect(snap.tools.map((t) => t.name).sort()).toEqual(['app.exp', 'app.search']);
  });

  it('writes a snapshot file when --out is provided', async () => {
    const config = writeConfig('config-file.mjs', CONFIG_TEMPLATE);
    const out = join(tmp, 'out', 'snapshot.json');
    const code = await runSnapshotCmd(
      { config, out },
      { stdout: () => {}, stderr: () => {} },
    );
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const snap = parseSnapshot(JSON.parse(readFileSync(out, 'utf8')), out);
    expect(snap.tools).toHaveLength(2);
  });

  it('respects --tiers filter', async () => {
    const config = writeConfig('config-tiers.mjs', CONFIG_TEMPLATE);
    let stdout = '';
    const code = await runSnapshotCmd(
      { config, tiers: ['stable'] },
      { stdout: (s) => { stdout += s; }, stderr: () => {} },
    );
    expect(code).toBe(0);
    const snap = parseSnapshot(JSON.parse(stdout), 'stdout');
    expect(snap.tools.map((t) => t.name)).toEqual(['app.search']);
  });

  it('returns 2 when config does not exist', async () => {
    let stderr = '';
    const code = await runSnapshotCmd(
      { config: join(tmp, 'no-such.mjs') },
      { stdout: () => {}, stderr: (s) => { stderr += s; } },
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/failed to load config/);
  });

  it('returns 2 when config does not default-export a Registry', async () => {
    const config = writeConfig(
      'config-no-default.mjs',
      "export const notDefault = 42;\n",
    );
    let stderr = '';
    const code = await runSnapshotCmd(
      { config },
      { stdout: () => {}, stderr: (s) => { stderr += s; } },
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/did not default-export a Registry/);
  });

  it('awaits a Promise<Registry> default export', async () => {
    const config = writeConfig(
      'config-async.mjs',
      `
import { createRegistry, defineCommand, ok } from '${ACTURE_URL}';
const registry = createRegistry();
registry.register(defineCommand({
  id: 'app.async',
  title: 'Async',
  execute: () => ok(null),
}));
export default Promise.resolve(registry);
`,
    );
    let stdout = '';
    const code = await runSnapshotCmd(
      { config },
      { stdout: (s) => { stdout += s; }, stderr: () => {} },
    );
    expect(code).toBe(0);
    const snap = parseSnapshot(JSON.parse(stdout), 'stdout');
    expect(snap.tools[0]!.name).toBe('app.async');
  });
});
