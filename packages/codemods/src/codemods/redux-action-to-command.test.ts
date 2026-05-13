import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reduxActionToCommand } from './redux-action-to-command.js';

function withFile(content: string, ext = '.ts'): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acture-codemods-'));
  const path = join(dir, `Sample${ext}`);
  writeFileSync(path, content);
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('redux-action-to-command', () => {
  it('rewrites a dispatch({type, payload}) call', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void, id: string) {
  dispatch({ type: 'cart/addItem', payload: { id, qty: 1 } });
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('registry.dispatch("cart/addItem", { id, qty: 1 })');
    expect(after).toMatch(/import \{ registry \} from ["']\.\/acture\/registry["']/);
    cleanup();
  });

  it('rewrites a dispatch({type}) call without payload', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void) {
  dispatch({ type: 'cart/clear' });
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    expect(result.files[0]!.after).toContain('registry.dispatch("cart/clear")');
    expect(result.files[0]!.after).not.toContain('undefined');
    cleanup();
  });

  it('skips non-literal type fields', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void, t: string) {
  dispatch({ type: t, payload: 1 });
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('non-literal type');
    cleanup();
  });

  it('skips action objects with extra keys (likely Redux metadata)', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void) {
  dispatch({ type: 'x', payload: 1, meta: { trace: 'a' } });
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    expect(result.files[0]!.notes?.[0]).toContain('extra keys');
    cleanup();
  });

  it('respects --option callees=', async () => {
    const { path, cleanup } = withFile(
      `function f(storeDispatch: (a: any) => void) {
  storeDispatch({ type: 'x', payload: 1 });
}
`,
    );
    const result = await reduxActionToCommand.run({
      files: [path],
      options: { callees: 'storeDispatch' },
    });
    expect(result.files[0]!.after).toContain('registry.dispatch("x", 1)');
    cleanup();
  });

  it('id-rewrite=dot rewrites slash ids to dot form', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void) {
  dispatch({ type: 'cart/addItem', payload: 1 });
}
`,
    );
    const result = await reduxActionToCommand.run({
      files: [path],
      options: { 'id-rewrite': 'dot' },
    });
    expect(result.files[0]!.after).toContain('registry.dispatch("app.cart.addItem", 1)');
    cleanup();
  });

  it('id-rewrite=dot leaves already-dotted ids alone', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void) {
  dispatch({ type: 'app.cart.addItem', payload: 1 });
}
`,
    );
    const result = await reduxActionToCommand.run({
      files: [path],
      options: { 'id-rewrite': 'dot' },
    });
    expect(result.files[0]!.after).toContain('registry.dispatch("app.cart.addItem", 1)');
    cleanup();
  });

  it('extends an existing registry import rather than duplicating', async () => {
    const { path, cleanup } = withFile(
      `import { something } from './acture/registry';
function f(dispatch: (a: any) => void) {
  dispatch({ type: 'x' });
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after.match(/from ["']\.\/acture\/registry["']/g)?.length).toBe(1);
    expect(after).toMatch(/import \{ something, registry \}/);
    cleanup();
  });

  it('ignores dispatch calls with non-object args', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void, action: any) {
  dispatch(action);
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    expect(result.files[0]!.changed).toBe(false);
    cleanup();
  });

  it('rewrites multiple calls in one file', async () => {
    const { path, cleanup } = withFile(
      `function f(dispatch: (a: any) => void) {
  dispatch({ type: 'a' });
  dispatch({ type: 'b', payload: 2 });
  dispatch({ type: 'c', payload: { z: 3 } });
}
`,
    );
    const result = await reduxActionToCommand.run({ files: [path] });
    const after = result.files[0]!.after;
    expect(after).toContain('registry.dispatch("a")');
    expect(after).toContain('registry.dispatch("b", 2)');
    expect(after).toContain('registry.dispatch("c", { z: 3 })');
    cleanup();
  });
});
