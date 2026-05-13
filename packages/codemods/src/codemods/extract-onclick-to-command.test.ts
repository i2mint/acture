import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractOnClickToCommand } from './extract-onclick-to-command.js';

function withFile(content: string, ext = '.tsx'): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acture-codemods-'));
  const path = join(dir, `Sample${ext}`);
  writeFileSync(path, content);
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('extract-onclick-to-command', () => {
  it('lifts an inline arrow onClick into a defineCommand', async () => {
    const { path, cleanup } = withFile(
      `export function Save() {
  return <button onClick={() => save()}>Save</button>;
}
declare function save(): void;
`,
    );
    const result = await extractOnClickToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('defineCommand({');
    expect(after).toContain("id: \"app.wrapped.save\"");
    expect(after).toContain('registry.dispatch(__cmd_save.id)');
    expect(after).toMatch(/import \{ defineCommand, ok \} from ["']acture["']/);
    expect(after).toMatch(/import \{ registry \} from ["']\.\/acture\/registry["']/);
    cleanup();
  });

  it('skips handlers with parameters', async () => {
    const { path, cleanup } = withFile(
      `export function F() {
  return <input onChange={(e) => setX(e.target.value)} />;
}
declare function setX(v: string): void;
`,
    );
    const result = await extractOnClickToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('skipped onChange — handler takes parameters');
    cleanup();
  });

  it('skips bare references (not arrow functions)', async () => {
    const { path, cleanup } = withFile(
      `export function X({ save }: { save: () => void }) {
  return <button onClick={save}>S</button>;
}
`,
    );
    const result = await extractOnClickToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });

  it('uses --option id-prefix', async () => {
    const { path, cleanup } = withFile(
      `export function Save() {
  return <button onClick={() => save()}>Save</button>;
}
declare function save(): void;
`,
    );
    const result = await extractOnClickToCommand.run({
      files: [path],
      options: { 'id-prefix': 'app.button' },
    });
    expect(result.files[0]!.after).toContain('id: "app.button.save"');
    cleanup();
  });

  it('handles block-body arrow with multiple statements', async () => {
    const { path, cleanup } = withFile(
      `export function Submit() {
  return <button onClick={() => { console.log("clicked"); save(); }}>S</button>;
}
declare function save(): void;
`,
    );
    const result = await extractOnClickToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('execute: () => {');
    expect(after).toContain('console.log("clicked")');
    expect(after).toContain('save()');
    expect(after).toContain('return ok(undefined);');
    cleanup();
  });
});
