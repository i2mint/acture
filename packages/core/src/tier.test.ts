/**
 * Tier-system runtime tests. The JSDoc-tag mirror lives in
 * `@acture/build-tier`; this file verifies what the registry does once
 * a command already carries `tier` / `deprecationReason` / `internalToken`.
 */

import { describe, it, expect } from 'vitest';
import { createRegistry, defineCommand, ok } from './index.js';

describe('tier filtering', () => {
  it('defaults to stable only', () => {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({
        id: 'app.a',
        title: 'A',
        tier: 'stable',
        execute: () => ok('a'),
      }),
      defineCommand({
        id: 'app.b',
        title: 'B',
        tier: 'experimental',
        execute: () => ok('b'),
      }),
    ]);
    const ids = registry.list().map((c) => c.id);
    expect(ids).toEqual(['app.a']);
  });

  it('includes experimental when opted in', () => {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({
        id: 'app.a',
        title: 'A',
        tier: 'stable',
        execute: () => ok('a'),
      }),
      defineCommand({
        id: 'app.b',
        title: 'B',
        tier: 'experimental',
        execute: () => ok('b'),
      }),
    ]);
    const ids = registry
      .list({ tiers: ['stable', 'experimental'] })
      .map((c) => c.id);
    expect(ids.sort()).toEqual(['app.a', 'app.b']);
  });

  it("'all' includes every tier except internal unless asked", () => {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({ id: 'app.s', title: 'S', tier: 'stable', execute: () => ok(null) }),
      defineCommand({ id: 'app.e', title: 'E', tier: 'experimental', execute: () => ok(null) }),
      defineCommand({ id: 'app.d', title: 'D', tier: 'deprecated', execute: () => ok(null) }),
      defineCommand({ id: 'app.i', title: 'I', tier: 'internal', execute: () => ok(null) }),
    ]);
    const ids = registry.list({ tiers: 'all' }).map((c) => c.id);
    expect(ids.sort()).toEqual(['app.d', 'app.e', 'app.s']);
  });

  it("internal is included only when explicitly named", () => {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({ id: 'app.i', title: 'I', tier: 'internal', execute: () => ok(null) }),
    ]);
    expect(registry.list({ tiers: ['internal'] }).map((c) => c.id)).toEqual(['app.i']);
  });
});

describe('@internal symbol-token enforcement', () => {
  it('allows dispatch without a token when no internalToken is attached (build step did not run)', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.untokened',
        title: 'Untokened',
        tier: 'internal',
        execute: () => ok('went through'),
      }),
    );
    const r = await registry.dispatch('app.untokened');
    expect(r.ok).toBe(true);
  });

  it('rejects external dispatch when an internalToken is attached and not presented', async () => {
    const registry = createRegistry();
    const moduleToken = Symbol('acture.internal');
    registry.register({
      // Bypass the helper so we can set internalToken; users do this via
      // the build-tier mirror in production.
      id: 'app.tokened',
      title: 'Tokened',
      tier: 'internal',
      internalToken: moduleToken,
      execute: () => ok('ran'),
    });
    const r = await registry.dispatch('app.tokened');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('internal_dispatch_denied');
    }
  });

  it('allows dispatch when the matching internalToken is presented', async () => {
    const registry = createRegistry();
    const moduleToken = Symbol('acture.internal');
    registry.register({
      id: 'app.tokened.allow',
      title: 'Tokened',
      tier: 'internal',
      internalToken: moduleToken,
      execute: () => ok('ran'),
    });
    const r = await registry.dispatch(
      'app.tokened.allow',
      undefined,
      undefined,
      { internalToken: moduleToken },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects dispatch with a DIFFERENT token', async () => {
    const registry = createRegistry();
    const moduleToken = Symbol('acture.internal');
    const otherToken = Symbol('acture.internal');
    registry.register({
      id: 'app.tokened.deny',
      title: 'Tokened',
      tier: 'internal',
      internalToken: moduleToken,
      execute: () => ok('ran'),
    });
    const r = await registry.dispatch(
      'app.tokened.deny',
      undefined,
      undefined,
      { internalToken: otherToken },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('internal_dispatch_denied');
    }
  });
});

describe('deprecationReason field', () => {
  it('is preserved on the frozen CommandRecord', () => {
    const cmd = defineCommand({
      id: 'app.legacy.thing',
      title: 'Legacy',
      description: 'Original.',
      tier: 'deprecated',
      deprecationReason: 'use app.modern.thing instead',
      execute: () => ok(null),
    });
    expect(cmd.deprecationReason).toBe('use app.modern.thing instead');
    expect(cmd.tier).toBe('deprecated');
  });
});
