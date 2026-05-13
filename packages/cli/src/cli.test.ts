/**
 * End-to-end CLI integration tests. Spawns the actual CLI script with
 * temp-file fixtures so we exercise the same code path users will hit.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_ENTRY = new URL('./cli.ts', import.meta.url).pathname;
const NODE_LOADER_ARGS = ['--import', 'tsx'];

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [...NODE_LOADER_ARGS, CLI_ENTRY, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'acture-cli-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeSnapshot(name: string, tools: unknown[]): string {
  const path = join(tmp, name);
  writeFileSync(
    path,
    JSON.stringify({ version: 1, generator: 'test', tools }, null, 2),
  );
  return path;
}

const baseTool = {
  name: 'app.search',
  description: 'Search the corpus.',
  inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  tier: 'stable',
  deprecationReason: null,
  aliases: [],
  when: null,
};

describe('acture compare-schemas CLI', () => {
  it('reports MAJOR when a command is removed', () => {
    const base = writeSnapshot('removed-base.json', [baseTool, { ...baseTool, name: 'app.gone' }]);
    const head = writeSnapshot('removed-head.json', [baseTool]);
    const r = runCli(['compare-schemas', base, head]);
    expect(r.code).toBe(0); // no --fail-on, exit clean
    expect(r.stdout).toMatch(/command-removed/);
    expect(r.stdout).toMatch(/Max severity: major/);
  });

  it('exits non-zero with --fail-on major when MAJOR changes are present', () => {
    const base = writeSnapshot('fail-base.json', [baseTool, { ...baseTool, name: 'app.gone' }]);
    const head = writeSnapshot('fail-head.json', [baseTool]);
    const r = runCli(['compare-schemas', base, head, '--fail-on', 'major']);
    expect(r.code).toBe(1);
  });

  it('exits zero with --fail-on major when only MINOR changes exist', () => {
    const base = writeSnapshot('ok-base.json', [baseTool]);
    const head = writeSnapshot('ok-head.json', [
      baseTool,
      { ...baseTool, name: 'app.new' },
    ]);
    const r = runCli(['compare-schemas', base, head, '--fail-on', 'major']);
    expect(r.code).toBe(0);
  });

  it('--allow-description-edits downgrades description-only diffs to MINOR', () => {
    const base = writeSnapshot('desc-base.json', [baseTool]);
    const head = writeSnapshot('desc-head.json', [
      { ...baseTool, description: 'Search the corpus more cleverly.' },
    ]);
    const r = runCli([
      'compare-schemas',
      base,
      head,
      '--allow-description-edits',
      '--fail-on',
      'major',
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/description-changed/);
    expect(r.stdout).toMatch(/MINOR/);
  });

  it('without --allow-description-edits, description changes are MAJOR', () => {
    const base = writeSnapshot('desc2-base.json', [baseTool]);
    const head = writeSnapshot('desc2-head.json', [
      { ...baseTool, description: 'Different.' },
    ]);
    const r = runCli([
      'compare-schemas',
      base,
      head,
      '--fail-on',
      'major',
    ]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/MAJOR/);
  });

  it('emits JSON when --format json is given', () => {
    const base = writeSnapshot('json-base.json', [baseTool]);
    const head = writeSnapshot('json-head.json', []);
    const r = runCli(['compare-schemas', base, head, '--format', 'json']);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.maxSeverity).toBe('major');
    expect(parsed.changes[0].kind).toBe('command-removed');
  });

  it('--help prints usage including snapshot subcommand', () => {
    const r = runCli(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/compare-schemas/);
    expect(r.stdout).toMatch(/snapshot/);
  });
});

describe('acture snapshot CLI', () => {
  const ACTURE_URL = new URL('../../core/dist/index.js', import.meta.url).href;

  it('emits a snapshot for a config module', () => {
    const config = join(tmp, 'cli-config.mjs');
    writeFileSync(
      config,
      `
import { createRegistry, defineCommand, ok } from '${ACTURE_URL}';
const r = createRegistry();
r.register(defineCommand({ id: 'app.x', title: 'X', execute: () => ok(null) }));
export default r;
`,
      'utf8',
    );
    const r = runCli(['snapshot', config]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.version).toBe(1);
    expect(parsed.tools[0].name).toBe('app.x');
  });

  it('writes to --out file and prints a confirmation', () => {
    const config = join(tmp, 'cli-config-out.mjs');
    writeFileSync(
      config,
      `
import { createRegistry, defineCommand, ok } from '${ACTURE_URL}';
const r = createRegistry();
r.register(defineCommand({ id: 'app.x', title: 'X', execute: () => ok(null) }));
export default r;
`,
      'utf8',
    );
    const outPath = join(tmp, 'cli-snap-out.json');
    const r = runCli(['snapshot', config, '--out', outPath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/snapshot written/);
  });

  it('returns 2 for unknown subcommand', () => {
    const r = runCli(['no-such-cmd']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown subcommand/);
  });

  it('returns 2 when snapshot config is missing', () => {
    const r = runCli(['snapshot']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/missing <config>/);
  });
});
