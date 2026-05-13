import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok } from 'acture';
import { snapshotRegistry, commandToSnapshotTool, parseSnapshot } from './snapshot.js';

describe('snapshotRegistry', () => {
  it('emits one tool per registered command (including non-stable when tiers=all)', () => {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({
        id: 'app.search',
        title: 'Search',
        description: 'Search the corpus.',
        params: z.object({ query: z.string().min(1) }),
        execute: () => ok({ hits: [] }),
      }),
      defineCommand({
        id: 'app.experimental.thing',
        title: 'Experimental',
        description: 'Experimental.',
        tier: 'experimental',
        execute: () => ok({}),
      }),
    ]);
    const snap = snapshotRegistry(registry);
    expect(snap.version).toBe(1);
    expect(snap.tools.map((t) => t.name).sort()).toEqual([
      'app.experimental.thing',
      'app.search',
    ]);
  });

  it('records tier=stable by default when no tier is declared', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.x',
        title: 'X',
        execute: () => ok(null),
      }),
    );
    const snap = snapshotRegistry(registry);
    expect(snap.tools[0]!.tier).toBe('stable');
    expect(snap.tools[0]!.deprecationReason).toBeNull();
  });

  it('preserves aliases and when-clause string form', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.x',
        title: 'X',
        aliases: ['foo', 'bar'],
        when: 'editor.focused == true',
        execute: () => ok(null),
      }),
    );
    const snap = snapshotRegistry(registry);
    expect(snap.tools[0]!.aliases).toEqual(['foo', 'bar']);
    expect(snap.tools[0]!.when).toBe('editor.focused == true');
  });

  it('records function-form when-clauses as the literal string "<function>"', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.x',
        title: 'X',
        when: () => true,
        execute: () => ok(null),
      }),
    );
    const snap = snapshotRegistry(registry);
    expect(snap.tools[0]!.when).toBe('<function>');
  });
});

describe('commandToSnapshotTool', () => {
  it('uses the projected JSON Schema as inputSchema', () => {
    const cmd = defineCommand({
      id: 'app.s',
      title: 'S',
      params: z.object({ q: z.string() }),
      execute: () => ok(null),
    });
    const t = commandToSnapshotTool(cmd);
    expect(t.inputSchema['type']).toBe('object');
    expect((t.inputSchema['properties'] as Record<string, unknown>)['q']).toBeDefined();
  });
});

describe('parseSnapshot', () => {
  it('throws on missing version', () => {
    expect(() => parseSnapshot({ tools: [] }, 'test')).toThrow(/version/);
  });

  it('throws when tools is not an array', () => {
    expect(() => parseSnapshot({ version: 1, tools: 'oops' }, 'test')).toThrow(/array/);
  });

  it('accepts a well-formed snapshot', () => {
    const snap = parseSnapshot(
      { version: 1, generator: 'test', tools: [] },
      'test',
    );
    expect(snap.tools).toEqual([]);
  });
});
