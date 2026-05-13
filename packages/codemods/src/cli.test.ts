import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './cli.js';

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (s: string) => out.push(s),
      stderr: (s: string) => err.push(s),
    },
  };
}

function withSampleDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acture-codemods-cli-'));
  writeFileSync(
    join(dir, 'Button.tsx'),
    `export function Btn({ save }: { save: () => void }) {
  return <button onClick={save}>S</button>;
}
`,
  );
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('CLI', () => {
  it('--help prints usage with exit 0', async () => {
    const { io, out } = captureIo();
    const code = await runCli(['--help'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('acture-codemods');
    expect(out.join('\n')).toContain('Usage:');
  });

  it('--list shows shipped codemods', async () => {
    const { io, out } = captureIo();
    const code = await runCli(['--list'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('wrap-handler-with-mutation');
    expect(out.join('\n')).toContain('extract-onclick-to-command');
  });

  it('--manifest emits a JSON manifest', async () => {
    const { io, out } = captureIo();
    const code = await runCli(['--manifest'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.codemods).toBeInstanceOf(Array);
    expect(parsed.codemods.length).toBeGreaterThan(0);
    expect(parsed.codemods[0]).toHaveProperty('name');
    expect(parsed.codemods[0]).toHaveProperty('status');
  });

  it('runs wrap-handler-with-mutation with --dry-run + --json', async () => {
    const { dir, cleanup } = withSampleDir();
    const { io, out } = captureIo();
    const code = await runCli(
      ['wrap-handler-with-mutation', '--target', dir, '--dry-run', '--json'],
      io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.codemod).toBe('wrap-handler-with-mutation');
    expect(parsed.summary.changed).toBe(1);
    expect(parsed.files[0]!.after).toContain('wrapMutation');
    // dry-run: file on disk unchanged.
    expect(readFileSync(join(dir, 'Button.tsx'), 'utf-8')).toContain('onClick={save}');
    cleanup();
  });

  it('writes when --dry-run absent', async () => {
    const { dir, cleanup } = withSampleDir();
    const { io } = captureIo();
    const code = await runCli(
      ['wrap-handler-with-mutation', '--target', dir, '--json'],
      io,
    );
    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'Button.tsx'), 'utf-8')).toContain('wrapMutation(save)');
    cleanup();
  });

  it('returns 2 for unknown codemod', async () => {
    const { dir, cleanup } = withSampleDir();
    const { io, err } = captureIo();
    const code = await runCli(['no-such-codemod', '--target', dir], io);
    expect(code).toBe(2);
    expect(err.join('\n')).toContain('Unknown codemod');
    cleanup();
  });

  it('returns 2 when no files matched', async () => {
    const { io, err } = captureIo();
    const code = await runCli(['wrap-handler-with-mutation'], io);
    expect(code).toBe(2);
    expect(err.join('\n')).toContain('No files matched');
  });

  it('returns 2 on missing codemod name', async () => {
    const { io, err } = captureIo();
    const code = await runCli(['--target', '/tmp'], io);
    expect(code).toBe(2);
    expect(err.join('\n')).toContain('Missing codemod name');
  });

  it('--option key=value reaches the codemod', async () => {
    const { dir, cleanup } = withSampleDir();
    const { io, out } = captureIo();
    const code = await runCli(
      [
        'wrap-handler-with-mutation',
        '--target',
        dir,
        '--dry-run',
        '--json',
        '--option',
        'events=onMouseEnter',
      ],
      io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join('\n'));
    // We rewrote --events to onMouseEnter only, so onClick should NOT be wrapped.
    expect(parsed.files[0]!.after).toContain('onClick={save}');
    cleanup();
  });
});
