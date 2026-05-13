/**
 * End-to-end smoke for the Phase 4 tier mirror.
 *
 * Phase 4 acceptance criteria 1–3:
 *   1. A command tagged `@experimental` in source is auto-mirrored to
 *      `tier: 'experimental'` at build time.
 *   2. `registry.toMCPServer()` (i.e. `buildToolsList`) excludes the
 *      experimental command from `tools/list`.
 *   3. `registry.toMCPServer({ tiers: ['stable', 'experimental'] })`
 *      includes it.
 *
 * We exercise the whole chain: source with JSDoc → `transformSource` →
 * `eval` the resulting JS → register the produced records → run the MCP
 * `buildToolsList` projection.
 *
 * `eval` is normally a hard-don't (`acture-hard-donts` §5) but it is
 * fine here: the test owns its input string entirely.
 */

import { describe, it, expect } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import { buildToolsList } from '@acture/mcp';
import { transformSource } from './transform.js';

function transformAndEvalRegistry(): ReturnType<typeof createRegistry> {
  const source = `
    /** @stable */
    const a = defineCommand({
      id: 'app.a',
      title: 'A',
      description: 'Stable A.',
      execute: () => ({ ok: true, value: 'a' }),
    });

    /** @experimental */
    const b = defineCommand({
      id: 'app.b',
      title: 'B',
      description: 'Experimental B.',
      execute: () => ({ ok: true, value: 'b' }),
    });

    /** @deprecated use app.a instead */
    const c = defineCommand({
      id: 'app.c',
      title: 'C',
      description: 'Old C.',
      execute: () => ({ ok: true, value: 'c' }),
    });

    /** @internal */
    const d = defineCommand({
      id: 'app.d',
      title: 'D',
      description: 'Internal D.',
      execute: () => ({ ok: true, value: 'd' }),
    });

    return { a, b, c, d };
  `;
  const transformed = transformSource(source).code;
  // The `defineCommand` imported here flows into the transformed source
  // by closing over it in a Function constructor. We keep `ok` available
  // for the `execute` bodies, though our toy specs don't use it.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const make = new Function('defineCommand', 'ok', transformed) as (
    dc: typeof defineCommand,
    okFn: typeof ok,
  ) => { a: ReturnType<typeof defineCommand>; b: ReturnType<typeof defineCommand>; c: ReturnType<typeof defineCommand>; d: ReturnType<typeof defineCommand> };
  const { a, b, c, d } = make(defineCommand, ok);
  const registry = createRegistry();
  registry.registerAll([a, b, c, d]);
  return registry;
}

describe('Phase 4 tier-mirror end-to-end', () => {
  it('mirrors @stable / @experimental / @deprecated / @internal into tier metadata', () => {
    const registry = transformAndEvalRegistry();
    expect(registry.get('app.a')!.tier).toBe('stable');
    expect(registry.get('app.b')!.tier).toBe('experimental');
    expect(registry.get('app.c')!.tier).toBe('deprecated');
    expect(registry.get('app.d')!.tier).toBe('internal');
  });

  it('mirrors @deprecated <reason> into deprecationReason', () => {
    const registry = transformAndEvalRegistry();
    expect(registry.get('app.c')!.deprecationReason).toBe('use app.a instead');
  });

  it('AC2: buildToolsList() excludes the @experimental command by default', () => {
    const registry = transformAndEvalRegistry();
    const tools = buildToolsList(registry);
    const names = tools.map((t) => t.name);
    expect(names).toContain('app.a');
    expect(names).not.toContain('app.b');
    expect(names).not.toContain('app.c');
    expect(names).not.toContain('app.d');
  });

  it('AC3: buildToolsList({ tiers: [stable, experimental] }) includes the @experimental command', () => {
    const registry = transformAndEvalRegistry();
    const tools = buildToolsList(registry, { tiers: ['stable', 'experimental'] });
    const names = tools.map((t) => t.name);
    expect(names).toContain('app.b');
  });

  it('AC4: deprecated description starts with [DEPRECATED — <reason>]', () => {
    const registry = transformAndEvalRegistry();
    const tools = buildToolsList(registry, { tiers: ['stable', 'deprecated'] });
    const dep = tools.find((t) => t.name === 'app.c');
    expect(dep?.description).toMatch(/^\[DEPRECATED — use app\.a instead\]/);
  });

  it('AC5: dispatching an @internal command from outside the registering module is rejected', async () => {
    const registry = transformAndEvalRegistry();
    // The token is module-scoped to the eval'd module — we cannot see
    // it from this test (which is "outside" the registering module).
    const result = await registry.dispatch('app.d');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('internal_dispatch_denied');
  });

  it('AC5: @internal IS dispatchable when the matching token is presented (in-module path)', async () => {
    // For this assertion the test acts as if it WAS the registering
    // module: it grabs the symbol the build-step injected and passes
    // it on dispatch. End-users do not write this by hand — the
    // injection makes the in-module call sites work transparently.
    const registry = transformAndEvalRegistry();
    const cmd = registry.get('app.d')!;
    const token = cmd.internalToken;
    expect(token).toBeTypeOf('symbol');
    const result = await registry.dispatch(
      'app.d',
      undefined,
      undefined,
      { internalToken: token },
    );
    expect(result.ok).toBe(true);
  });
});
