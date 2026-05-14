import { describe, it, expect, vi } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import { enableTierWarnings } from './tier-warnings.js';

function setup() {
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({
      id: 'app.stable',
      title: 'Stable',
      execute: () => ok('s'),
    }),
    defineCommand({
      id: 'app.experimental',
      title: 'Experimental',
      tier: 'experimental',
      execute: () => ok('x'),
    }),
    defineCommand({
      id: 'app.experimental.two',
      title: 'Experimental Two',
      tier: 'experimental',
      execute: () => ok('y'),
    }),
  ]);
  return registry;
}

describe('enableTierWarnings', () => {
  it('warns once on first dispatch of an experimental command', async () => {
    const registry = setup();
    const warn = vi.fn();
    enableTierWarnings(registry, { enabled: true, warn });
    await registry.dispatch('app.experimental');
    await registry.dispatch('app.experimental');
    await registry.dispatch('app.experimental');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/experimental command "app\.experimental"/);
  });

  it('warns separately for each distinct experimental command', async () => {
    const registry = setup();
    const warn = vi.fn();
    enableTierWarnings(registry, { enabled: true, warn });
    await registry.dispatch('app.experimental');
    await registry.dispatch('app.experimental.two');
    await registry.dispatch('app.experimental');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('does not warn for stable commands', async () => {
    const registry = setup();
    const warn = vi.fn();
    enableTierWarnings(registry, { enabled: true, warn });
    await registry.dispatch('app.stable');
    await registry.dispatch('app.stable');
    expect(warn).not.toHaveBeenCalled();
  });

  it('is suppressed when enabled: false', async () => {
    const registry = setup();
    const warn = vi.fn();
    enableTierWarnings(registry, { enabled: false, warn });
    await registry.dispatch('app.experimental');
    expect(warn).not.toHaveBeenCalled();
  });

  it('is suppressed when ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1', async () => {
    const registry = setup();
    const warn = vi.fn();
    const proc = (globalThis as { process: { env: Record<string, string | undefined> } }).process;
    const prev = proc.env['ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS'];
    proc.env['ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS'] = '1';
    try {
      enableTierWarnings(registry, { warn });
      await registry.dispatch('app.experimental');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete proc.env['ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS'];
      else proc.env['ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS'] = prev;
    }
  });

  it('is idempotent — calling twice returns the same disposer', () => {
    const registry = setup();
    const warn = vi.fn();
    const d1 = enableTierWarnings(registry, { enabled: true, warn });
    const d2 = enableTierWarnings(registry, { enabled: true, warn });
    expect(d1).toBe(d2);
  });

  it('preserves errors-as-data — unknown commands still resolve to {ok: false}', async () => {
    const registry = setup();
    enableTierWarnings(registry, { enabled: true, warn: () => {} });
    const r = await registry.dispatch('no.such.thing');
    expect(r.ok).toBe(false);
  });

  it('the disposer restores the original dispatch', async () => {
    const registry = setup();
    const warn = vi.fn();
    const dispose = enableTierWarnings(registry, { enabled: true, warn });
    await registry.dispatch('app.experimental');
    dispose();
    // Now wrap a fresh logger; second call should warn (a NEW
    // enableTierWarnings instance starts with a fresh warnedIds set).
    const warn2 = vi.fn();
    enableTierWarnings(registry, { enabled: true, warn: warn2 });
    await registry.dispatch('app.experimental');
    expect(warn2).toHaveBeenCalledTimes(1);
  });
});
