import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useStateMutationToCommand } from './usestate-mutation-to-command.js';

function withFile(content: string, ext = '.tsx'): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acture-codemods-'));
  const path = join(dir, `Sample${ext}`);
  writeFileSync(path, content);
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('usestate-mutation-to-command', () => {
  it('wraps an expression-body setter call', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const [count, setCount] = [0, (n: number) => {}];
  return <button onClick={() => setCount(count + 1)}>+</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain(
      'wrapMutation(() => setCount(count + 1), { id: "app.state.setCount" })',
    );
    expect(after).toMatch(/import \{ wrapMutation \} from ["']@acture\/migration["']/);
    cleanup();
  });

  it('wraps a block-body with multiple setters using the first setter id', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const setOpen = (b: boolean) => {};
  const setActive = (s: string) => {};
  return <button onClick={() => { setOpen(true); setActive('a'); }}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    expect(result.files[0]!.after).toContain('id: "app.state.setOpen"');
    cleanup();
  });

  it('skips handlers with non-setter statements in the body', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const setCount = (n: number) => {};
  return <button onClick={() => { setCount(1); console.log('hi'); }}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('non-setter statements');
    cleanup();
  });

  it('skips handlers without a setter call', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const save = () => {};
  return <button onClick={() => save()}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });

  it('is idempotent on already-wrapped handlers', async () => {
    const { path, cleanup } = withFile(
      `import { wrapMutation } from '@acture/migration';
export function C() {
  const setX = (n: number) => {};
  return <button onClick={wrapMutation(() => setX(1), { id: 'app.state.setX' })}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });

  it('respects --option id-prefix', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const setCount = (n: number) => {};
  return <button onClick={() => setCount(1)}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({
      files: [path],
      options: { 'id-prefix': 'app.counter' },
    });
    expect(result.files[0]!.after).toContain('id: "app.counter.setCount"');
    cleanup();
  });

  it('respects --option setter-pattern (custom convention)', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const updateCount = (n: number) => {};
  return <button onClick={() => updateCount(1)}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({
      files: [path],
      options: { 'setter-pattern': '^update[A-Z]' },
    });
    expect(result.files[0]!.after).toContain('id: "app.state.updateCount"');
    cleanup();
  });

  it('does not touch handlers on other event types by default', async () => {
    const { path, cleanup } = withFile(
      `export function C() {
  const setX = (n: number) => {};
  return <button onMouseEnter={() => setX(1)}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });

  it('does not wrap bare references (only arrow functions)', async () => {
    const { path, cleanup } = withFile(
      `export function C({ setX }: { setX: () => void }) {
  return <button onClick={setX}>x</button>;
}
`,
    );
    const result = await useStateMutationToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });
});
