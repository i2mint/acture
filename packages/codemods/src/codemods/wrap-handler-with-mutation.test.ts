import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wrapHandlerWithMutation } from './wrap-handler-with-mutation.js';

function withFile(content: string, ext = '.tsx'): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acture-codemods-'));
  const path = join(dir, `Sample${ext}`);
  writeFileSync(path, content);
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('wrap-handler-with-mutation', () => {
  it('wraps a bare onClick reference', async () => {
    const { path, cleanup } = withFile(
      `export function Button({ save }: { save: () => void }) {
  return <button onClick={save}>Save</button>;
}
`,
    );
    const result = await wrapHandlerWithMutation.run({ files: [path] });
    expect(result.summary.changed).toBe(1);
    expect(result.files[0]!.after).toContain('onClick={wrapMutation(save)}');
    expect(result.files[0]!.after).toMatch(/from ["']@acture\/migration["']/);
    cleanup();
  });

  it('wraps an inline arrow onClick', async () => {
    const { path, cleanup } = withFile(
      `export function Btn() {
  return <button onClick={() => doStuff()}>X</button>;
}
declare function doStuff(): void;
`,
    );
    const result = await wrapHandlerWithMutation.run({ files: [path] });
    expect(result.files[0]!.after).toContain('onClick={wrapMutation(() => doStuff())}');
    cleanup();
  });

  it('is idempotent on already-wrapped handlers', async () => {
    const { path, cleanup } = withFile(
      `import { wrapMutation } from '@acture/migration';
export function Btn({ save }: { save: () => void }) {
  return <button onClick={wrapMutation(save)}>Save</button>;
}
`,
    );
    const result = await wrapHandlerWithMutation.run({ files: [path] });
    expect(result.summary.changed).toBe(0);
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });

  it('handles onChange and onSubmit', async () => {
    const { path, cleanup } = withFile(
      `export function F({ a, b }: { a: () => void; b: () => void }) {
  return (
    <form onSubmit={b}>
      <input onChange={a} />
    </form>
  );
}
`,
    );
    const result = await wrapHandlerWithMutation.run({ files: [path] });
    expect(result.files[0]!.after).toContain('onSubmit={wrapMutation(b)}');
    expect(result.files[0]!.after).toContain('onChange={wrapMutation(a)}');
    cleanup();
  });

  it('does not touch other handler attributes', async () => {
    const { path, cleanup } = withFile(
      `export function X({ a, b }: { a: () => void; b: () => void }) {
  return <button onClick={a} onMouseEnter={b}>x</button>;
}
`,
    );
    const result = await wrapHandlerWithMutation.run({ files: [path] });
    expect(result.files[0]!.after).toContain('onClick={wrapMutation(a)}');
    expect(result.files[0]!.after).toContain('onMouseEnter={b}');
    expect(result.files[0]!.after).not.toContain('wrapMutation(b)');
    cleanup();
  });

  it('respects --events option', async () => {
    const { path, cleanup } = withFile(
      `export function X({ a, b }: { a: () => void; b: () => void }) {
  return <button onClick={a} onMouseEnter={b}>x</button>;
}
`,
    );
    const result = await wrapHandlerWithMutation.run({
      files: [path],
      options: { events: 'onMouseEnter' },
    });
    expect(result.files[0]!.after).toContain('onClick={a}');
    expect(result.files[0]!.after).toContain('onMouseEnter={wrapMutation(b)}');
    cleanup();
  });

  it('adds named import to existing migration import', async () => {
    const { path, cleanup } = withFile(
      `import { chooseImplementation } from '@acture/migration';
export function X({ a }: { a: () => void }) {
  return <button onClick={a}>x</button>;
}
`,
    );
    const result = await wrapHandlerWithMutation.run({ files: [path] });
    expect(result.files[0]!.after).toMatch(
      /import \{ chooseImplementation, wrapMutation \} from ["']@acture\/migration["']/,
    );
    cleanup();
  });

  it('respects dryRun: does not write files', async () => {
    const original = `export function X({ a }: { a: () => void }) {
  return <button onClick={a}>x</button>;
}
`;
    const { path, cleanup } = withFile(original);
    const result = await wrapHandlerWithMutation.run({ files: [path], dryRun: true });
    expect(result.files[0]!.changed).toBe(true);
    expect(result.files[0]!.after).not.toBe(result.files[0]!.before);
    // The file on disk is still the original.
    expect(readFileSync(path, 'utf-8')).toBe(original);
    cleanup();
  });

  it('writes when dryRun is false', async () => {
    const { path, cleanup } = withFile(
      `export function X({ a }: { a: () => void }) {
  return <button onClick={a}>x</button>;
}
`,
    );
    await wrapHandlerWithMutation.run({ files: [path] });
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('onClick={wrapMutation(a)}');
    cleanup();
  });
});
