import { describe, it, expect } from 'vitest';
import { createRegistry, defineCommand, ok, err } from 'acture';
import { instrumentRegistry } from './dispatch-log.js';

function setup() {
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({
      id: 'app.greet',
      title: 'Greet',
      execute: () => ok('hello'),
    }),
    defineCommand({
      id: 'app.fail',
      title: 'Fail',
      execute: () => err('boom', 'kaboom'),
    }),
  ]);
  return registry;
}

describe('instrumentRegistry', () => {
  it('records a successful dispatch', async () => {
    const registry = setup();
    const log = instrumentRegistry(registry);
    await registry.dispatch('app.greet');
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.commandId).toBe('app.greet');
    expect(log.entries[0]!.result.ok).toBe(true);
  });

  it('records an error dispatch', async () => {
    const registry = setup();
    const log = instrumentRegistry(registry);
    await registry.dispatch('app.fail');
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.result.ok).toBe(false);
  });

  it('is idempotent — calling twice returns the same log', () => {
    const registry = setup();
    const a = instrumentRegistry(registry);
    const b = instrumentRegistry(registry);
    expect(a).toBe(b);
  });

  it('notifies subscribers on each dispatch', async () => {
    const registry = setup();
    const log = instrumentRegistry(registry);
    let calls = 0;
    const unsub = log.subscribe(() => {
      calls++;
    });
    await registry.dispatch('app.greet');
    await registry.dispatch('app.greet');
    expect(calls).toBe(2);
    unsub();
  });

  it('clears entries on clear()', async () => {
    const registry = setup();
    const log = instrumentRegistry(registry);
    await registry.dispatch('app.greet');
    log.clear();
    expect(log.entries).toEqual([]);
  });

  it('caps entries at maxEntries', async () => {
    const registry = setup();
    const log = instrumentRegistry(registry, { maxEntries: 3 });
    for (let i = 0; i < 10; i++) {
      await registry.dispatch('app.greet');
    }
    expect(log.entries).toHaveLength(3);
    // Latest entries kept: ids should be the last 3.
    const ids = log.entries.map((e) => e.id);
    expect(ids).toEqual([8, 9, 10]);
  });

  it('preserves the original dispatch contract — unknown command returns errors-as-data', async () => {
    const registry = setup();
    instrumentRegistry(registry);
    const r = await registry.dispatch('nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_command');
  });
});
