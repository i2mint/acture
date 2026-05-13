import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rtkThunkToCommand } from './rtk-thunk-to-command.js';

function withFile(content: string, ext = '.ts'): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acture-codemods-'));
  const path = join(dir, `Sample${ext}`);
  writeFileSync(path, content);
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('rtk-thunk-to-command', () => {
  it('converts a basic async thunk', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const fetchUser = createAsyncThunk(
  'users/fetchUser',
  async (id: string) => {
    const res = await fetch(\`/users/\${id}\`);
    return await res.json();
  },
);
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('defineCommand({');
    expect(after).toContain('id: "users/fetchUser"');
    expect(after).toContain('title: "Fetch User"');
    expect(after).toContain('return ok(await res.json());');
    expect(after).toMatch(/import \{ defineCommand, ok \} from ["']acture["']/);
    cleanup();
  });

  it('handles an expression-body arrow', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const fetchOne = createAsyncThunk('app/fetchOne', async (id: string) => fetch('/x/' + id));
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    expect(result.files[0]!.after).toContain('execute: async (id: string) => ok(fetch');
    cleanup();
  });

  it('rewrites bare return; to return ok(undefined);', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const ping = createAsyncThunk('app/ping', async () => {
  if (Math.random() > 0.5) return;
  await fetch('/ping');
});
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('return ok(undefined);');
    // The trailing-no-return case should also have an appended ok(undefined).
    cleanup();
  });

  it('appends return ok(undefined) when thunk has no return', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const sideEffect = createAsyncThunk('app/sideEffect', async () => {
  await fetch('/x');
});
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    expect(result.files[0]!.after).toContain('return ok(undefined);');
    expect(result.files[0]!.notes?.some((n) => n.includes('appended return ok(undefined)'))).toBe(
      true,
    );
    cleanup();
  });

  it('rewrites multiple returns in the same body', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const maybeFetch = createAsyncThunk('app/maybeFetch', async (id: string) => {
  if (!id) return null;
  const res = await fetch('/x/' + id);
  return await res.json();
});
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('return ok(null);');
    expect(after).toContain('return ok(await res.json());');
    cleanup();
  });

  it('skips thunks with options arg (3 args)', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const t = createAsyncThunk(
  'app/t',
  async () => 1,
  { condition: () => true },
);
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('expected exactly 2 args');
    cleanup();
  });

  it('skips thunks with non-literal id', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
const id = 'app/t';
export const t = createAsyncThunk(id, async () => 1);
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('non-literal id');
    cleanup();
  });

  it('skips thunks where the 2nd arg is not a function', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
const fn = async () => 1;
export const t = createAsyncThunk('app/t', fn);
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('payload creator is not a function');
    cleanup();
  });

  it('emits a notes hint suggesting users add a params schema', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const t = createAsyncThunk('app/t', async (x: string) => x);
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    expect(
      result.files[0]!.notes?.some((n) => n.includes('Add a params:')),
    ).toBe(true);
    cleanup();
  });

  it('respects --option title-from=id', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const t = createAsyncThunk('users/fetchUser', async () => 1);
`,
    );
    const result = await rtkThunkToCommand.run({
      files: [path],
      options: { 'title-from': 'id' },
    });
    expect(result.files[0]!.after).toContain('title: "users/fetchUser"');
    cleanup();
  });

  it('converts multiple thunks in one file', async () => {
    const { path, cleanup } = withFile(
      `import { createAsyncThunk } from '@reduxjs/toolkit';
export const a = createAsyncThunk('app/a', async () => 1);
export const b = createAsyncThunk('app/b', async () => 2);
`,
    );
    const result = await rtkThunkToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('id: "app/a"');
    expect(after).toContain('id: "app/b"');
    expect(after.match(/defineCommand\(/g)?.length).toBe(2);
    cleanup();
  });
});
