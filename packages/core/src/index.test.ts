import { describe, expect, it } from 'vitest';
import { __version, defineCommand } from './index.js';

describe('acture core — phase 0 smoke test', () => {
  it('exposes the package-version stub', () => {
    expect(__version).toBe('0.0.0');
  });

  it('defineCommand returns a frozen object preserving inputs', () => {
    const cmd = defineCommand<undefined, string>({
      id: 'app.test.noop',
      title: 'No-op test command',
      execute: () => 'ok',
    });
    expect(Object.isFrozen(cmd)).toBe(true);
    expect(cmd.id).toBe('app.test.noop');
    expect(cmd.title).toBe('No-op test command');
  });

  it('rejects mutation of the frozen record', () => {
    const cmd = defineCommand<undefined, string>({
      id: 'app.test.noop',
      title: 'No-op test command',
      execute: () => 'ok',
    });
    // ESM modules are always in strict mode → assignment to a frozen
    // field throws TypeError rather than silently failing.
    expect(() => {
      (cmd as { id: string }).id = 'mutated';
    }).toThrow();
  });
});
