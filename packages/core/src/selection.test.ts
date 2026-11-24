import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry } from './registry.js';
import {
  composeUndo,
  createSelectionCommands,
  createSelectionLock,
  sameSelection,
  defaultConfirmPolicy,
  liftToSelection,
  planSelection,
  type Selection,
  type SelectionAction,
  type UndoOffer,
} from './selection.js';

interface Song {
  id: string;
  owner: string;
  trashed: boolean;
}

const songs = (): Song[] => [
  { id: 'a', owner: 'me', trashed: false },
  { id: 'b', owner: 'me', trashed: false },
  { id: 'c', owner: 'you', trashed: false },
  { id: 'd', owner: 'me', trashed: true },
];

/** A tiny library: a query selection matches by owner. */
function library(rows = songs()) {
  const byIds = (ids: readonly string[]) => rows.filter((r) => ids.includes(r.id));
  const resolve = (s: Selection<{ owner?: string }>) => {
    if (s.kind === 'ids') return byIds(s.ids);
    const matched = rows.filter((r) => !s.query.owner || r.owner === s.query.owner);
    const ids = new Set(matched.map((r) => r.id));
    for (const id of s.include ?? []) ids.add(id);
    for (const id of s.exclude ?? []) ids.delete(id);
    return { items: rows.filter((r) => ids.has(r.id)), matched: matched.length };
  };
  return { rows, resolve };
}

const trash = (opts: { failOn?: string[] } = {}) =>
  liftToSelection<Song>({
    id: 'library.selection.moveToTrash',
    title: 'Move the selection to the Trash',
    reversal: 'compensating',
    verb: (n) => `Move ${n} songs to Trash`,
    done: (n) => `${n} songs moved to Trash`,
    appliesTo: (s) => (s.trashed ? 'already in the Trash' : s.owner === 'me' || 'not yours'),
    runItem(s) {
      if (opts.failOn?.includes(s.id)) throw new Error(`cannot trash ${s.id}`);
      s.trashed = true;
      // compare-and-set: put it back only if it is still where this action left it
      return () => {
        if (!s.trashed) return 'conflict';
        s.trashed = false;
      };
    },
  });

describe('planSelection: the gate', () => {
  it('splits targets from refusals, with the reasons, before anything runs', async () => {
    const { rows, resolve } = library();
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'c', 'd'] }, { resolve });
    expect(plan.targets.map((s) => s.id)).toEqual(['a']);
    expect(plan.refused.map((r) => [r.item.id, r.why])).toEqual([
      ['c', 'not yours'],
      ['d', 'already in the Trash'],
    ]);
    expect(rows.find((r) => r.id === 'a')!.trashed).toBe(false);
  });

  it('a false gate without a reason says "does not apply"', async () => {
    const { resolve } = library();
    const action: SelectionAction<Song> = { ...trash(), appliesTo: () => false };
    const plan = await planSelection(action, undefined, { kind: 'ids', ids: ['a'] }, { resolve });
    expect(plan.refused[0]!.why).toBe('does not apply');
  });
});

describe('one undo step', () => {
  it('a compensating action acts at once and offers one Undo for all of it', async () => {
    const { rows, resolve } = library();
    const offers: UndoOffer[] = [];
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: (o) => offers.push(o) });
    expect(plan.confirm).toBeNull();
    const out = (await plan.go())!;
    expect(out.done.map((s) => s.id)).toEqual(['a', 'b']);
    expect(rows.filter((r) => r.trashed).map((r) => r.id)).toEqual(['a', 'b', 'd']);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.message).toBe('2 songs moved to Trash');
    await offers[0]!.undo();
    expect(rows.filter((r) => r.trashed).map((r) => r.id)).toEqual(['d']);
  });

  it('runs inside the transaction seam once', async () => {
    const { resolve } = library();
    const transaction = vi.fn(async (fn: () => Promise<void>) => fn());
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, transaction });
    await plan.go();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('composeUndo runs last first, and each part once when called again', async () => {
    const log: string[] = [];
    let failB = true;
    const undo = composeUndo([
      () => void log.push('a'),
      () => {
        if (failB) throw new Error('b');
        log.push('b');
      },
      () => void log.push('c'),
    ]);
    await expect(undo()).rejects.toThrow(/1 of 3/);
    expect(log).toEqual(['c', 'a']);
    failB = false;
    expect(await undo()).toEqual({ restored: 3, conflicts: 0 });
    expect(log).toEqual(['c', 'a', 'b']);
  });

  it('composeUndo: two calls at once undo once (a double click)', async () => {
    let n = 0;
    const undo = composeUndo([async () => { await new Promise((r) => setTimeout(r, 1)); n++; }]);
    await Promise.all([undo(), undo()]);
    expect(n).toBe(1);
  });

  it('Undo is compare-and-set: an item changed since is a conflict, left as it is', async () => {
    const { rows, resolve } = library();
    const offers: UndoOffer[] = [];
    await (await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: (o) => offers.push(o) })).go();
    rows.find((r) => r.id === 'a')!.trashed = false; // restored by hand meanwhile
    expect(await offers[0]!.undo()).toEqual({ restored: 1, conflicts: 1 });
  });

  it('undo runs in reverse completion order with concurrency', async () => {
    const order: string[] = [];
    const action = liftToSelection<Song>({
      ...trash(),
      async runItem(s) {
        await new Promise((r) => setTimeout(r, s.id === 'a' ? 5 : 0)); // b finishes first
        return () => void order.push(s.id);
      },
    }, { concurrency: 2 });
    const { resolve } = library();
    const out = await (await planSelection(action, undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: () => {} })).go();
    await out!.undo!();
    expect(order).toEqual(['a', 'b']); // a completed last, so it is undone first
  });

  it('no Undo when an item could not give one, and it says so', async () => {
    const { resolve } = library();
    const action = liftToSelection<Song>({ ...trash(), runItem: () => null });
    const offer = vi.fn();
    const out = (await (await planSelection(action, undefined, { kind: 'ids', ids: ['a'] }, { resolve, offer })).go())!;
    expect(out.undo).toBeNull();
    expect(out.warnings[0]).toMatch(/gave no Undo/);
    expect(offer).not.toHaveBeenCalled();
  });

  it('afterRun and offer errors are warnings, never a failed action', async () => {
    const { rows, resolve } = library();
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a'] }, {
      resolve,
      offer: () => { throw new Error('no toast'); },
      afterRun: () => { throw new Error('boom'); },
    });
    const out = (await plan.go())!;
    expect(out.done).toHaveLength(1);
    expect(out.warnings).toEqual(['The Undo could not be offered: no toast', 'After the action: boom']);
    expect(rows.find((r) => r.id === 'a')!.trashed).toBe(true);
  });
});

describe('the checks at go()', () => {
  it('a batch run\'s Undo runs once on a double click', async () => {
    const { resolve } = library();
    let n = 0;
    const batch: SelectionAction<Song> = { ...trash(), run: (t) => ({ done: t, undo: async () => { await new Promise((r) => setTimeout(r, 1)); n++; } }) };
    const out = (await (await planSelection(batch, undefined, { kind: 'ids', ids: ['a'] }, { resolve, offer: () => {} })).go())!;
    await Promise.all([out.undo!(), out.undo!()]);
    await out.undo!();
    expect(n).toBe(1);
  });

  it('go() does not run when a target stopped applying since the plan', async () => {
    const { rows, resolve } = library();
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: () => {} });
    rows.find((r) => r.id === 'b')!.owner = 'you';
    const out = (await plan.go())!;
    expect(out.stale).toMatch(/changed since/);
    expect(out.done).toHaveLength(0);
    expect(rows.find((r) => r.id === 'a')!.trashed).toBe(false);
  });

  it('with a transaction, its undo is what is offered', async () => {
    const { resolve } = library();
    const transactionUndo = vi.fn();
    const offers: UndoOffer[] = [];
    const batch: SelectionAction<Song> = { ...trash(), run: (t) => ({ done: t, undo: null }) };
    const plan = await planSelection(batch, undefined, { kind: 'ids', ids: ['a', 'b'] }, {
      resolve, offer: (o) => offers.push(o), transaction: (fn) => fn(), transactionUndo,
    });
    expect(plan.confirm).toBeNull();
    await plan.go();
    await offers[0]!.undo();
    expect(transactionUndo).toHaveBeenCalledTimes(1);
  });

  it('a transaction without its undo is no Undo: the policy asks', async () => {
    const { resolve } = library();
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: () => {}, transaction: (fn) => fn() });
    expect(plan.confirm).not.toBeNull();
  });
});

describe('partial failure', () => {
  it('reports each failure, offers Undo for the part done, and retries the rest', async () => {
    const { rows, resolve } = library();
    const failOn = ['b'];
    const offers: UndoOffer[] = [];
    const plan = await planSelection(trash({ failOn }), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: (o) => offers.push(o) });
    const out = (await plan.go())!;
    expect(out.done.map((s) => s.id)).toEqual(['a']);
    expect(out.failed.map((f) => [f.item.id, f.error])).toEqual([['b', 'cannot trash b']]);
    expect(offers.map((o) => o.count)).toEqual([1]);
    failOn.length = 0;
    rows.find((r) => r.id === 'b')!.owner = 'me';
    const again = (await out.retry())!;
    expect(again.done.map((s) => s.id)).toEqual(['b']);
    expect(rows.find((r) => r.id === 'b')!.trashed).toBe(true);
    // Undo of the first run takes back only what it did.
    await offers[0]!.undo();
    expect(rows.filter((r) => r.trashed).map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('a run that throws fails every target, with no Undo', async () => {
    const { resolve } = library();
    const action: SelectionAction<Song> = {
      ...trash(),
      run: () => {
        throw new Error('offline');
      },
    };
    const out = (await (await planSelection(action, undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve })).go())!;
    expect(out.failed.map((f) => f.error)).toEqual(['offline', 'offline']);
    expect(out.undo).toBeNull();
  });
});

describe('when to ask first', () => {
  const policyOf = (reversal: SelectionAction<Song>['reversal'], count: number, undoAvailable = true) =>
    defaultConfirmPolicy({ actionId: 'x', reversal, count, verb: `Do ${count}`, undoAvailable, hidden: 0, params: {} });

  it('the default policy: compensating and deferred act when an Undo is offered; manual asks above one; none always asks', () => {
    expect(policyOf('compensating', 50)).toBeNull();
    expect(policyOf('deferred', 50)).toBeNull();
    expect(policyOf('compensating', 50, false)?.question).toBe('Do 50?'); // no way to offer the Undo
    expect(policyOf('manual', 1)).toBeNull();
    expect(policyOf('manual', 2)?.confirmLabel).toBe('Do 2');
    expect(policyOf('none', 1)?.question).toBe('Do 1?');
  });

  it('an item weaker than the action (reversalOf) makes the whole plan ask', async () => {
    const { resolve } = library();
    const action: SelectionAction<Song> = { ...trash(), reversalOf: (s) => (s.id === 'b' ? 'none' : 'compensating') };
    const plan = await planSelection(action, undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: () => {} });
    expect(plan.reversal).toBe('none');
    expect(plan.confirm?.question).toBe('Move 2 songs to Trash?');
  });

  it('asks when an expectedCount cannot be checked', async () => {
    const plan = await planSelection(trash(), undefined, { kind: 'query', query: {}, expectedCount: 2 }, { resolve: () => songs().slice(0, 2), offer: () => {} });
    expect(plan.confirm?.question).toMatch(/could not be counted/);
  });

  it('thenOffer: false means confirm or Undo, never both', async () => {
    const { resolve } = library();
    const offer = vi.fn();
    const policy = () => ({ question: 'Sure?', confirmLabel: 'Go', thenOffer: false });
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer, policy });
    await plan.go();
    expect(offer).not.toHaveBeenCalled();
  });

  it('asks when the query now matches a different number than the person saw', async () => {
    const { resolve } = library();
    const sel: Selection<{ owner?: string }> = { kind: 'query', query: { owner: 'me' }, exclude: ['d'], expectedCount: 2 };
    const plan = await planSelection(trash(), undefined, sel, { resolve, offer: () => {} });
    expect(plan.targets.map((s) => s.id)).toEqual(['a', 'b']);
    expect(plan.confirm?.question).toMatch(/now matches 3 \(you chose 2\)/);
  });

  it('asks when some targets are not shown, and says how many', async () => {
    const { resolve } = library();
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, shown: () => ['a'], offer: () => {} });
    expect(plan.hidden).toBe(1);
    expect(plan.confirm?.question).toBe('1 of them is not shown now. Move 2 songs to Trash?');
  });

  it('a host policy (undo-toast advise) replaces the rule', async () => {
    const { resolve } = library();
    const policy = vi.fn(() => ({ question: 'Sure?', confirmLabel: 'Move them', typeToConfirm: true }));
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, policy });
    expect(policy).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'library.selection.moveToTrash', reversal: 'compensating', count: 2, verb: 'Move 2 songs to Trash', undoAvailable: false }));
    expect(plan.confirm).toEqual({ question: 'Sure?', confirmLabel: 'Move them', typeToConfirm: true });
  });
});

describe('createSelectionCommands', () => {
  type Seams = Partial<Parameters<typeof createSelectionCommands<Song, { owner?: string }>>[1]>;
  const tagAction: SelectionAction<Song, { tag: string }> = {
    id: 'library.selection.tag',
    title: 'Tag the selection',
    reversal: 'manual',
    params: z.object({ tag: z.string().min(1) }),
    verb: (n, p) => `Tag ${n} songs “${p.tag}”`,
    done: (n, p) => `${n} songs tagged “${p.tag}”`,
    run: (targets) => ({ done: targets, undo: null }),
  };
  const setup = (initial: Selection<{ owner?: string }>, extra: Seams = {}) => {
    const lib = library();
    let current = initial;
    const registry = createRegistry();
    const commands = createSelectionCommands<Song, { owner?: string }>([trash(), tagAction], { resolve: lib.resolve, current: () => current, ...extra });
    for (const c of commands) registry.register(c);
    return { ...lib, registry, select: (s: Selection<{ owner?: string }>) => { current = s; } };
  };
  const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error!.code);

  it('runs on the current selection', async () => {
    const afterRun = vi.fn();
    const { rows, registry } = setup({ kind: 'ids', ids: ['a', 'c'] }, { afterRun });
    const r = await registry.dispatch('library.selection.moveToTrash', {});
    expect(r).toEqual({ ok: true, value: { done: 1, failed: 0, refused: 1, failures: [], warnings: [] } });
    expect(rows.find((x) => x.id === 'a')!.trashed).toBe(true);
    expect(afterRun).toHaveBeenCalledTimes(1);
  });

  it('a selection passed as a parameter wins (AI and MCP); null means the current one', async () => {
    const { rows, registry } = setup({ kind: 'ids', ids: ['a'] }, { shown: () => ['a', 'b', 'c', 'd'] });
    expect(code(await registry.dispatch('library.selection.moveToTrash', { selection: { kind: 'ids', ids: ['b'] } }))).toBe('ok');
    expect(rows.find((x) => x.id === 'b')!.trashed).toBe(true);
    expect(code(await registry.dispatch('library.selection.moveToTrash', { selection: null, confirmed: null }))).toBe('ok');
    expect(rows.find((x) => x.id === 'a')!.trashed).toBe(true);
  });

  it('ids passed as a parameter ask first when nothing says what is shown', async () => {
    const { registry } = setup({ kind: 'ids', ids: [] });
    expect(code(await registry.dispatch('library.selection.moveToTrash', { selection: { kind: 'ids', ids: ['b'] } }))).toBe('needs_confirmation');
  });

  it('what cannot be undone is never confirmed by token: needs_person, or the confirm seam', async () => {
    const purge: SelectionAction<Song> = { ...trash(), id: 'library.selection.purge', reversal: 'none', verb: (n) => `Delete ${n} songs permanently` };
    const lib = library();
    const registry = createRegistry();
    for (const c of createSelectionCommands<Song, { owner?: string }>([purge], { resolve: lib.resolve, current: () => ({ kind: 'ids', ids: ['a'] }) })) registry.register(c);
    const r = await registry.dispatch('library.selection.purge', {});
    expect(code(r)).toBe('needs_person');
    expect(JSON.stringify(r)).not.toMatch(/token/);
  });

  it('a query passed as a parameter without expectedCount asks first', async () => {
    const { registry } = setup({ kind: 'ids', ids: [] });
    const r = await registry.dispatch('library.selection.moveToTrash', { selection: { kind: 'query', query: { owner: 'me' } } });
    expect(code(r)).toBe('needs_confirmation');
  });

  it('a yes is a token bound to the plan: confirmed: true is not one, and a changed selection asks again', async () => {
    const t = setup({ kind: 'ids', ids: ['a', 'b'] });
    const asked = await t.registry.dispatch('library.selection.tag', { tag: 'x' });
    expect(code(asked)).toBe('needs_confirmation');
    const details = (asked as { error: { message: string; details: { token: string; typeToConfirm: boolean; count: number } } }).error;
    expect(details.message).toBe('Tag 2 songs “x”?');
    expect(details.details).toMatchObject({ count: 2, typeToConfirm: false });
    expect(code(await t.registry.dispatch('library.selection.tag', { tag: 'x', confirmed: 'true' }))).toBe('needs_confirmation');
    t.select({ kind: 'ids', ids: ['a', 'b', 'c', 'd'] }); // grows after the question
    t.rows.forEach((r) => { r.trashed = false; });
    const changed = await t.registry.dispatch('library.selection.tag', { tag: 'x', confirmed: details.details.token });
    expect(code(changed)).toBe('needs_confirmation');
    expect((changed as { error: { message: string } }).error.message).toMatch(/changed since you confirmed/);
    const token = (changed as { error: { details: { token: string } } }).error.details.token;
    expect(code(await t.registry.dispatch('library.selection.tag', { tag: 'x', confirmed: token }))).toBe('ok');
  });

  it('with a confirm seam the command asks the person itself', async () => {
    const confirm = vi.fn(async () => false);
    const t = setup({ kind: 'ids', ids: ['a', 'b'] }, { confirm });
    expect(code(await t.registry.dispatch('library.selection.tag', { tag: 'x' }))).toBe('declined');
    confirm.mockResolvedValueOnce(true);
    expect(code(await t.registry.dispatch('library.selection.tag', { tag: 'x' }))).toBe('ok');
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2, question: 'Tag 2 songs “x”?' }));
  });

  it('validates the action params', async () => {
    const { registry } = setup({ kind: 'ids', ids: ['a'] });
    expect(code(await registry.dispatch('library.selection.tag', { tag: '' }))).toBe('invalid_params');
  });

  it('refuses an action that declares a reserved param', () => {
    const bad: SelectionAction<Song, { confirmed: boolean }> = { ...tagAction, id: 'library.selection.bad', params: z.object({ confirmed: z.boolean() }) } as never;
    expect(() => createSelectionCommands<Song>([bad], { resolve: () => [], current: () => ({ kind: 'ids', ids: [] }) })).toThrow(/reserved/);
  });

  it('says why when nothing applies, and when nothing is selected', async () => {
    const none = await setup({ kind: 'ids', ids: ['c'] }).registry.dispatch('library.selection.moveToTrash', {});
    expect(code(none)).toBe('nothing_applies');
    expect(!none.ok && none.error.message).toMatch(/not yours/);
    expect(code(await setup({ kind: 'ids', ids: [] }).registry.dispatch('library.selection.moveToTrash', {}))).toBe('empty_selection');
  });

  it('one at a time, shared with buttons through the lock', async () => {
    const lib = library();
    let release!: () => void;
    const slow: SelectionAction<Song> = {
      id: 'library.selection.slow',
      title: 'Slow',
      reversal: 'compensating',
      verb: (n) => `Slow ${n}`,
      done: (n) => `Slowed ${n}`,
      run: (t) => new Promise((r) => (release = () => r({ done: t, undo: null }))),
    };
    const lock = createSelectionLock();
    const registry = createRegistry();
    for (const c of createSelectionCommands<Song, { owner?: string }>([slow], { resolve: lib.resolve, lock, current: () => ({ kind: 'ids', ids: ['a'] }) })) registry.register(c);
    const first = registry.dispatch('library.selection.slow', {});
    await new Promise((r) => setTimeout(r, 0));
    expect(code(await registry.dispatch('library.selection.slow', {}))).toBe('busy');
    const button = await planSelection(slow, undefined, { kind: 'ids', ids: ['a'] }, { resolve: lib.resolve, lock });
    expect(await button.go()).toBeNull();
    release();
    expect((await first).ok).toBe(true);
  });
});

describe('the schema bridge', () => {
  it('projects a selection command to JSON Schema (AI and MCP see the selection param)', async () => {
    const { toJsonSchema } = await import('./schema-bridge.js');
    const [cmd] = createSelectionCommands<Song>([trash()], { resolve: () => [], current: () => ({ kind: 'ids', ids: [] }) });
    const env = toJsonSchema(cmd!);
    const schema = env.inputSchema as { properties: Record<string, unknown> };
    expect(env.description).toMatch(/current selection/);
    expect(Object.keys(schema.properties)).toEqual(['selection', 'confirmed']);
  });
});

describe('sameSelection', () => {
  it('compares by value, key order aside', () => {
    expect(sameSelection({ kind: 'query', query: { a: 1, b: 2 } }, { kind: 'query', query: { b: 2, a: 1 } })).toBe(true);
    expect(sameSelection({ kind: 'ids', ids: ['a'] }, { kind: 'ids', ids: ['b'] })).toBe(false);
  });
});

describe('retry', () => {
  it('reports what the gate now refuses', async () => {
    const { rows, resolve } = library();
    const failOn = ['b'];
    const out = (await (await planSelection(trash({ failOn }), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: () => {} })).go())!;
    rows.find((r) => r.id === 'b')!.owner = 'you';
    const again = (await out.retry())!;
    expect(again.done).toHaveLength(0);
    expect(again.refused.map((r) => [r.item.id, r.why])).toEqual([['b', 'not yours']]);
  });
});
