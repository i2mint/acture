import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry } from './registry.js';
import {
  composeUndo,
  createSelectionCommands,
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
      return () => {
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
    const out = await plan.go();
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
      () => log.push('a'),
      () => {
        if (failB) throw new Error('b');
        log.push('b');
      },
      () => log.push('c'),
    ]);
    await expect(undo()).rejects.toThrow(/1 of 3/);
    expect(log).toEqual(['c', 'a']);
    failB = false;
    await undo();
    expect(log).toEqual(['c', 'a', 'b']);
  });

  it('no Undo when an item could not give one', async () => {
    const { resolve } = library();
    const action = liftToSelection<Song>({ ...trash(), runItem: () => null });
    const offer = vi.fn();
    const out = await (await planSelection(action, undefined, { kind: 'ids', ids: ['a'] }, { resolve, offer })).go();
    expect(out.undo).toBeNull();
    expect(offer).not.toHaveBeenCalled();
  });
});

describe('partial failure', () => {
  it('reports each failure, offers Undo for the part done, and retries the rest', async () => {
    const { rows, resolve } = library();
    const failOn = ['b'];
    const offers: UndoOffer[] = [];
    const plan = await planSelection(trash({ failOn }), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, offer: (o) => offers.push(o) });
    const out = await plan.go();
    expect(out.done.map((s) => s.id)).toEqual(['a']);
    expect(out.failed.map((f) => [f.item.id, f.error])).toEqual([['b', 'cannot trash b']]);
    expect(offers.map((o) => o.count)).toEqual([1]);
    failOn.length = 0;
    const again = await out.retry();
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
    const out = await (await planSelection(action, undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve })).go();
    expect(out.failed.map((f) => f.error)).toEqual(['offline', 'offline']);
    expect(out.undo).toBeNull();
  });
});

describe('when to ask first', () => {
  const policyOf = (reversal: SelectionAction<Song>['reversal'], count: number) =>
    defaultConfirmPolicy({ reversal, count, verb: `Do ${count}` });

  it('the default policy: compensating and deferred act; manual asks above one; none always asks', () => {
    expect(policyOf('compensating', 50)).toBeNull();
    expect(policyOf('deferred', 50)).toBeNull();
    expect(policyOf('manual', 1)).toBeNull();
    expect(policyOf('manual', 2)?.confirmLabel).toBe('Do 2');
    expect(policyOf('none', 1)?.question).toBe('Do 1?');
  });

  it('asks when the query now matches a different number than the person saw', async () => {
    const { resolve } = library();
    const sel: Selection<{ owner?: string }> = { kind: 'query', query: { owner: 'me' }, exclude: ['d'], expectedCount: 2 };
    const plan = await planSelection(trash(), undefined, sel, { resolve });
    expect(plan.targets.map((s) => s.id)).toEqual(['a', 'b']);
    expect(plan.confirm?.question).toMatch(/now matches 3 \(you chose 2\)/);
  });

  it('asks when some targets are not shown, and says how many', async () => {
    const { resolve } = library();
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, shown: () => ['a'] });
    expect(plan.hidden).toBe(1);
    expect(plan.confirm?.question).toBe('1 of them is not shown now. Move 2 songs to Trash?');
  });

  it('a host policy (undo-toast advise) replaces the rule', async () => {
    const { resolve } = library();
    const policy = vi.fn(() => ({ question: 'Sure?', confirmLabel: 'Move them', typeToConfirm: true }));
    const plan = await planSelection(trash(), undefined, { kind: 'ids', ids: ['a', 'b'] }, { resolve, policy });
    expect(policy).toHaveBeenCalledWith({ reversal: 'compensating', count: 2, verb: 'Move 2 songs to Trash' });
    expect(plan.confirm).toEqual({ question: 'Sure?', confirmLabel: 'Move them', typeToConfirm: true });
  });
});

describe('createSelectionCommands', () => {
  const setup = (current: Selection<{ owner?: string }>, extra: Partial<Parameters<typeof createSelectionCommands<Song, { owner?: string }>>[1]> = {}) => {
    const lib = library();
    const tag: SelectionAction<Song, { tag: string }> = {
      id: 'library.selection.tag',
      title: 'Tag the selection',
      reversal: 'manual',
      params: z.object({ tag: z.string().min(1) }),
      verb: (n, p) => `Tag ${n} songs “${p.tag}”`,
      done: (n, p) => `${n} songs tagged “${p.tag}”`,
      run: (targets) => ({ done: targets, undo: null }),
    };
    const registry = createRegistry();
    const commands = createSelectionCommands<Song, { owner?: string }>([trash(), tag], { resolve: lib.resolve, current: () => current, ...extra });
    for (const c of commands) registry.register(c);
    return { ...lib, registry };
  };

  it('runs on the current selection', async () => {
    const afterRun = vi.fn();
    const { rows, registry } = setup({ kind: 'ids', ids: ['a', 'c'] }, { afterRun });
    const r = await registry.dispatch('library.selection.moveToTrash', {});
    expect(r).toEqual({ ok: true, value: { done: 1, failed: 0, refused: 1, failures: [] } });
    expect(rows.find((x) => x.id === 'a')!.trashed).toBe(true);
    expect(afterRun).toHaveBeenCalledTimes(1);
  });

  it('a selection passed as a parameter wins (AI and MCP)', async () => {
    const { rows, registry } = setup({ kind: 'ids', ids: [] });
    const r = await registry.dispatch('library.selection.moveToTrash', { selection: { kind: 'ids', ids: ['b'] } });
    expect(r.ok).toBe(true);
    expect(rows.find((x) => x.id === 'b')!.trashed).toBe(true);
  });

  it('needs a yes, then runs when confirmed', async () => {
    const { registry } = setup({ kind: 'ids', ids: ['a', 'b'] });
    const asked = await registry.dispatch('library.selection.tag', { tag: 'x' });
    expect(asked.ok).toBe(false);
    if (!asked.ok) {
      expect(asked.error.code).toBe('needs-confirmation');
      expect(asked.error.message).toBe('Tag 2 songs “x”?');
    }
    const ran = await registry.dispatch('library.selection.tag', { tag: 'x', confirmed: true });
    expect(ran.ok).toBe(true);
  });

  it('validates the action params', async () => {
    const { registry } = setup({ kind: 'ids', ids: ['a'] });
    const r = await registry.dispatch('library.selection.tag', { tag: '' });
    expect(r.ok).toBe(false);
  });

  it('says why when nothing applies, and when nothing is selected', async () => {
    const none = await setup({ kind: 'ids', ids: ['c'] }).registry.dispatch('library.selection.moveToTrash', {});
    expect(!none.ok && none.error.code).toBe('nothing-applies');
    expect(!none.ok && none.error.message).toMatch(/not yours/);
    const empty = await setup({ kind: 'ids', ids: [] }).registry.dispatch('library.selection.moveToTrash', {});
    expect(!empty.ok && empty.error.code).toBe('empty');
  });

  it('one at a time', async () => {
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
    const registry = createRegistry();
    for (const c of createSelectionCommands<Song, { owner?: string }>([slow], { resolve: lib.resolve, current: () => ({ kind: 'ids', ids: ['a'] }) })) registry.register(c);
    const first = registry.dispatch('library.selection.slow', {});
    await new Promise((r) => setTimeout(r, 0));
    const second = await registry.dispatch('library.selection.slow', {});
    expect(!second.ok && second.error.code).toBe('busy');
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
