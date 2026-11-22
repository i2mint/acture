import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createRegistry as createLiteRegistry,
  defineCommand as defineLite,
  RegistrationError,
  DuplicateCommandError,
  ok,
} from './lite.js';
import { createRegistry, validateCommand } from './index.js';
import { evaluateWhen } from './when.js';

const cmd = (id: string, extra: Record<string, unknown> = {}) =>
  defineLite({ id, title: id, execute: () => ok(id), ...extra });

describe('acture/lite — createRegistry', () => {
  it('dispatches and lists like the full registry', async () => {
    const r = createLiteRegistry();
    r.register(cmd('app.a.run'));
    expect(r.list().map((c) => c.id)).toEqual(['app.a.run']);
    expect(await r.dispatch('app.a.run')).toEqual({ ok: true, value: 'app.a.run' });
    expect((await r.dispatch('app.missing.x')).ok).toBe(false);
  });

  it('evaluates function when-clauses', async () => {
    const r = createLiteRegistry();
    r.register(cmd('app.a.gated', { when: (ctx: Record<string, unknown>) => ctx.open === true }));
    expect(r.list({ context: { open: false } })).toEqual([]);
    expect(r.list({ context: { open: true } })).toHaveLength(1);
    const denied = await r.dispatch('app.a.gated', undefined, { open: false });
    expect(denied.ok === false && denied.error.code).toBe('when_clause_failed');
  });

  it('refuses a DSL string when at register time, naming the fix', () => {
    const r = createLiteRegistry();
    expect(() => r.register(cmd('app.a.dsl', { when: 'open' }))).toThrow(RegistrationError);
    expect(() => r.register(cmd('app.a.dsl', { when: 'open' }))).toThrow(/evaluateWhen/);
    expect(r.has('app.a.dsl')).toBe(false);
  });

  it('refuses a batch containing a DSL string without registering any of it', () => {
    const r = createLiteRegistry();
    expect(() =>
      r.registerAll([cmd('app.a.fine'), cmd('app.a.dsl', { when: 'open' })]),
    ).toThrow(RegistrationError);
    expect(r.size()).toBe(0);
  });

  it('accepts DSL strings when an evaluateWhen is injected', async () => {
    const r = createLiteRegistry({ evaluateWhen });
    r.register(cmd('app.a.dsl', { when: 'open && count >= 2' }));
    expect(r.list({ context: { open: true, count: 2 } })).toHaveLength(1);
    expect((await r.dispatch('app.a.dsl', undefined, { open: true, count: 0 })).ok).toBe(false);
  });

  it('keeps tiers, duplicates and params validation', async () => {
    const r = createLiteRegistry();
    r.register(cmd('app.a.exp', { tier: 'experimental' }));
    expect(r.list()).toEqual([]);
    expect(r.list({ tiers: 'all' })).toHaveLength(1);
    expect(() => r.register(cmd('app.a.exp'))).toThrow(DuplicateCommandError);
    // A hand-written guard stands in for Zod on pages that ship none.
    const guard = {
      safeParse: (v: unknown) =>
        typeof v === 'number'
          ? { success: true as const, data: v }
          : { success: false as const, error: { issues: ['not a number'] } },
    };
    r.register(
      defineLite({
        id: 'app.a.num',
        title: 'num',
        params: guard as never,
        execute: (n: number) => ok(n * 2),
      }),
    );
    expect(await r.dispatch('app.a.num', 21)).toEqual({ ok: true, value: 42 });
    const bad = await r.dispatch('app.a.num', 'x');
    expect(bad.ok === false && bad.error.code).toBe('invalid_params');
  });
});

describe('acture/lite — defineCommand', () => {
  it('freezes without validating', () => {
    const c = defineLite({ id: 'Not A Valid Id', title: '', execute: () => ok(0) });
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('validateCommand from the full entry runs the checks lite skips', () => {
    expect(() =>
      validateCommand(defineLite({ id: 'Not A Valid Id', title: 't', execute: () => ok(0) })),
    ).toThrow(RegistrationError);
    expect(() =>
      validateCommand(defineLite({ id: 'app.a.ok', title: 't', params: z.object({ n: z.number() }), execute: () => ok(0) })),
    ).not.toThrow();
  });
});

describe('records move between entries unchanged', () => {
  it('a lite record registers and dispatches in the full registry', async () => {
    const full = createRegistry();
    full.register(cmd('app.a.run', { when: () => true }));
    expect(await full.dispatch('app.a.run')).toEqual({ ok: true, value: 'app.a.run' });
  });

  it('the full registry takes an injected evaluateWhen too', () => {
    const full = createRegistry({ evaluateWhen: () => false });
    full.register(cmd('app.a.run', { when: 'anything' }));
    expect(full.list({ context: {} })).toEqual([]);
  });
});
