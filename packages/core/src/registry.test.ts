import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import { defineCommand } from './command.js';
import {
  createRegistry,
  DuplicateCommandError,
  type CommandsChangedEvent,
} from './registry.js';
import { ok, err, isOk, isErr } from './result.js';
import type { AnyCommandRecord } from './types.js';

const trivialCmd = (id: string) =>
  defineCommand({ id, title: id, execute: () => ok(id) });

describe('createRegistry — basics', () => {
  it('starts empty', () => {
    const r = createRegistry();
    expect(r.size()).toBe(0);
    expect(r.list()).toEqual([]);
    expect(r.has('x.y.z')).toBe(false);
    expect(r.get('x.y.z')).toBeUndefined();
  });

  it('register adds a command and returns a disposer', () => {
    const r = createRegistry();
    const dispose = r.register(trivialCmd('app.a.b'));
    expect(r.has('app.a.b')).toBe(true);
    expect(r.size()).toBe(1);
    dispose();
    expect(r.has('app.a.b')).toBe(false);
    expect(r.size()).toBe(0);
  });

  it('disposer is idempotent', () => {
    const r = createRegistry();
    const d = r.register(trivialCmd('app.a.b'));
    d();
    d();
    expect(r.size()).toBe(0);
  });

  it('strictDuplicates rejects duplicate id by default', () => {
    const r = createRegistry();
    r.register(trivialCmd('app.dup.x'));
    expect(() => r.register(trivialCmd('app.dup.x'))).toThrow(DuplicateCommandError);
  });

  it('strictDuplicates=false replaces silently', () => {
    const r = createRegistry({ strictDuplicates: false });
    r.register(defineCommand({ id: 'a.b.c', title: 'first', execute: () => ok(1) }));
    r.register(defineCommand({ id: 'a.b.c', title: 'second', execute: () => ok(2) }));
    expect(r.get('a.b.c')?.title).toBe('second');
  });
});

describe('createRegistry — registerAll', () => {
  it('batches add and emits one event', () => {
    const r = createRegistry();
    const events: CommandsChangedEvent[] = [];
    r.onCommandsChanged((e) => events.push(e));
    r.registerAll([trivialCmd('a.b.x'), trivialCmd('a.b.y')]);
    expect(events).toHaveLength(1);
    expect(events[0]!.reason).toBe('registerAll');
    expect(events[0]!.added).toEqual(['a.b.x', 'a.b.y']);
  });

  it('disposing a batch removes only its own commands', () => {
    const r = createRegistry();
    r.register(trivialCmd('keep.a.b'));
    const dispose = r.registerAll([trivialCmd('drop.a.b'), trivialCmd('drop.c.d')]);
    expect(r.size()).toBe(3);
    dispose();
    expect(r.size()).toBe(1);
    expect(r.has('keep.a.b')).toBe(true);
  });

  it('rolls back partial registration on duplicate', () => {
    const r = createRegistry();
    r.register(trivialCmd('clash.a.b'));
    expect(() =>
      r.registerAll([trivialCmd('new.a.b'), trivialCmd('clash.a.b')]),
    ).toThrow(DuplicateCommandError);
    expect(r.has('new.a.b')).toBe(false);
    expect(r.has('clash.a.b')).toBe(true);
  });
});

describe('createRegistry — list/tier filtering', () => {
  const stable = defineCommand({ id: 'a.x.s', title: 's', tier: 'stable', execute: () => ok(0) });
  const exp = defineCommand({ id: 'a.x.e', title: 'e', tier: 'experimental', execute: () => ok(0) });
  const internal = defineCommand({ id: 'a.x.i', title: 'i', tier: 'internal', execute: () => ok(0) });
  const dep = defineCommand({ id: 'a.x.d', title: 'd', tier: 'deprecated', execute: () => ok(0) });

  it('default lists only stable', () => {
    const r = createRegistry();
    r.registerAll([stable, exp, internal, dep]);
    const ids = r.list().map((c) => c.id);
    expect(ids).toEqual(['a.x.s']);
  });

  it('explicit tier filter', () => {
    const r = createRegistry();
    r.registerAll([stable, exp, internal, dep]);
    expect(r.list({ tiers: ['stable', 'experimental'] }).map((c) => c.id))
      .toEqual(['a.x.s', 'a.x.e']);
  });

  it('tiers: "all" excludes internal unless explicitly included', () => {
    const r = createRegistry();
    r.registerAll([stable, exp, internal, dep]);
    const ids = r.list({ tiers: 'all' }).map((c) => c.id);
    expect(ids).not.toContain('a.x.i');
    expect(ids).toContain('a.x.e');
    expect(ids).toContain('a.x.d');
  });

  it('explicit internal tier surfaces internal commands', () => {
    const r = createRegistry();
    r.register(internal);
    const ids = r.list({ tiers: ['internal'] }).map((c) => c.id);
    expect(ids).toEqual(['a.x.i']);
  });

  it('context filters by when-clause', () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'a.x.c',
        title: 'c',
        when: 'editor.focused',
        execute: () => ok(0),
      }),
    );
    expect(r.list({ context: { editor: { focused: true } } })).toHaveLength(1);
    expect(r.list({ context: { editor: { focused: false } } })).toHaveLength(0);
  });
});

describe('createRegistry — dispatch', () => {
  it('returns unknown_command for missing id', async () => {
    const r = createRegistry();
    const result = await r.dispatch('does.not.exist');
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error.code).toBe('unknown_command');
  });

  it('validates params with Zod schema', async () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'app.test.add',
        title: 'add',
        params: z.object({ a: z.number(), b: z.number() }),
        execute: (p) => ok(p.a + p.b),
      }),
    );
    const good = await r.dispatch<number>('app.test.add', { a: 2, b: 3 });
    expect(isOk(good)).toBe(true);
    if (good.ok) expect(good.value).toBe(5);

    const bad = await r.dispatch('app.test.add', { a: 'hi' });
    expect(isErr(bad)).toBe(true);
    if (!bad.ok) expect(bad.error.code).toBe('invalid_params');
  });

  it('respects when-clause', async () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'app.test.gated',
        title: 'gated',
        when: 'editor.focused',
        execute: () => ok('ran'),
      }),
    );
    const blocked = await r.dispatch('app.test.gated', undefined, { editor: { focused: false } });
    expect(isErr(blocked)).toBe(true);
    if (!blocked.ok) expect(blocked.error.code).toBe('when_clause_failed');

    const allowed = await r.dispatch('app.test.gated', undefined, { editor: { focused: true } });
    expect(isOk(allowed)).toBe(true);
  });

  it('catches thrown errors from execute', async () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'app.test.boom',
        title: 'boom',
        execute: () => {
          throw new Error('kaboom');
        },
      }),
    );
    const result = await r.dispatch('app.test.boom');
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('execute_threw');
      expect(result.error.message).toMatch(/kaboom/);
    }
  });

  it('respects err() return from execute', async () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'app.test.bad',
        title: 'bad',
        execute: () => err('custom_code', 'bad thing'),
      }),
    );
    const result = await r.dispatch('app.test.bad');
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error.code).toBe('custom_code');
  });

  it('awaits async handlers', async () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'app.test.async',
        title: 'async',
        execute: async () => {
          await Promise.resolve();
          return ok(42);
        },
      }),
    );
    const result = await r.dispatch<number>('app.test.async');
    expect(isOk(result)).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });
});

describe('createRegistry — commandsChanged events', () => {
  it('fires register/unregister events', () => {
    const r = createRegistry();
    const listener = vi.fn();
    r.onCommandsChanged(listener);
    const dispose = r.register(trivialCmd('app.l.a'));
    dispose();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]![0]).toMatchObject({ reason: 'register', added: ['app.l.a'] });
    expect(listener.mock.calls[1]![0]).toMatchObject({ reason: 'unregister', removed: ['app.l.a'] });
  });

  it('unsubscribe stops events', () => {
    const r = createRegistry();
    const listener = vi.fn();
    const unsub = r.onCommandsChanged(listener);
    unsub();
    r.register(trivialCmd('app.l.b'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('listener errors do not break dispatch chain', () => {
    const r = createRegistry();
    r.onCommandsChanged(() => {
      throw new Error('listener boom');
    });
    const good = vi.fn();
    r.onCommandsChanged(good);
    expect(() => r.register(trivialCmd('app.l.c'))).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

/* ─────────────────── property-based invariants ─────────────────── */

const idArb = fc
  .tuple(
    fc.constantFrom('app', 'system', 'plugin'),
    fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,6}$/),
    fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,8}$/),
  )
  .map(([a, b, c]) => `${a}.${b}.${c}`);

describe('createRegistry — property invariants', () => {
  it('invariant: dispatching an unregistered id always returns unknown_command', () => {
    fc.assert(
      fc.asyncProperty(idArb, async (id) => {
        const r = createRegistry();
        const result = await r.dispatch(id);
        return !result.ok && result.error.code === 'unknown_command';
      }),
    );
  });

  it('invariant: register then dispose leaves the registry empty (mod-other-ids)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(idArb, { maxLength: 12, minLength: 1 }), (ids) => {
        const r = createRegistry();
        const disposers = ids.map((id) => r.register(trivialCmd(id)));
        if (r.size() !== ids.length) return false;
        for (const d of disposers) d();
        return r.size() === 0;
      }),
    );
  });

  it('invariant: no duplicate ids after batch (strictDuplicates=false)', () => {
    fc.assert(
      fc.property(fc.array(idArb, { minLength: 1, maxLength: 20 }), (ids) => {
        const r = createRegistry({ strictDuplicates: false });
        for (const id of ids) r.register(trivialCmd(id));
        const listed = r.list({ tiers: 'all' }).map((c) => c.id);
        const set = new Set(listed);
        return set.size === listed.length && set.size === new Set(ids).size;
      }),
    );
  });

  it('invariant: every command in list() is round-trippable via get()', () => {
    fc.assert(
      fc.property(fc.uniqueArray(idArb, { maxLength: 10, minLength: 0 }), (ids) => {
        const r = createRegistry();
        for (const id of ids) r.register(trivialCmd(id));
        const listed = r.list();
        for (const cmd of listed as readonly AnyCommandRecord[]) {
          if (r.get(cmd.id) !== cmd) return false;
        }
        return true;
      }),
    );
  });

  it('invariant: registerAll emits one event with exactly the batch ids', () => {
    fc.assert(
      fc.property(fc.uniqueArray(idArb, { minLength: 1, maxLength: 8 }), (ids) => {
        const r = createRegistry();
        let captured: CommandsChangedEvent | undefined;
        r.onCommandsChanged((e) => {
          captured = e;
        });
        r.registerAll(ids.map(trivialCmd));
        return (
          captured?.reason === 'registerAll' &&
          JSON.stringify(captured.added) === JSON.stringify(ids)
        );
      }),
    );
  });
});
