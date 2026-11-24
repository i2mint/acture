/**
 * acture-undo wired into `acture/selection` with the real history (not a mock transaction): a
 * selection command dispatched through the registry, and an Undo clicked while another change is
 * still in flight.
 */
import { describe, expect, it } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import {
  createSelectionCommands,
  planSelection,
  type Selection,
  type SelectionAction,
  type UndoOffer,
} from 'acture/selection';
import { createZustandAdapter } from 'acture-state-zustand';
import { createUndoHistory } from './undo.js';
import { undoSeamsFor } from './wiring.typecheck.test.js';

type S = { trashed: Record<string, boolean> };
type Item = { id: string };

function setup() {
  const adapter = createZustandAdapter<S>({ initialState: { trashed: { a: false, b: false } } });
  const registry = createRegistry();
  const history = createUndoHistory(adapter, registry);
  const trash: SelectionAction<Item> = {
    id: 'lib.selection.trash',
    title: 'Trash',
    reversal: 'compensating',
    verb: (n) => `Trash ${n}`,
    done: (n) => `${n} trashed`,
    run: (targets) => {
      adapter.setStateWithPatches((d) => {
        for (const t of targets) d.trashed[t.id] = true;
      });
      return { done: targets };
    },
  };
  const resolve = (sel: Selection) => (sel.kind === 'ids' ? sel.ids.map((id) => ({ id })) : []);
  return { adapter, registry, history, trash, resolve, undoSeams: undoSeamsFor(history) };
}

describe('acture/selection with acture-undo', () => {
  it('a selection command dispatched through the registry runs, records one entry, and its Undo takes it back', async () => {
    const { adapter, registry, history, trash, resolve, undoSeams } = setup();
    const offers: UndoOffer[] = [];
    registry.registerAll(
      createSelectionCommands([trash], {
        current: () => ({ kind: 'ids', ids: ['a', 'b'] }),
        resolve,
        shown: () => ['a', 'b'],
        offer: (o) => offers.push(o),
        ...undoSeams,
      }),
    );

    const r = await registry.dispatch('lib.selection.trash', {});
    expect(r.ok).toBe(true);
    expect(adapter.getState().trashed).toEqual({ a: true, b: true });
    expect(history.entries()).toHaveLength(1); // the bulk action is one undo entry
    expect(offers).toHaveLength(1);

    expect(await offers[0]!.undo()).toEqual({ restored: 2, conflicts: 0 });
    expect(adapter.getState().trashed).toEqual({ a: false, b: false });
  });

  it('a transaction inside a dispatch that changes nothing gives no handle', async () => {
    const { registry, history } = setup();
    let handle: unknown = 'unset';
    registry.registerAll([
      defineCommand({
        id: 'app.noop',
        title: 'Noop',
        execute: async () => {
          handle = await history.transaction(() => {});
          return ok(undefined);
        },
      }),
    ]);
    await registry.dispatch('app.noop', {});
    expect(handle).toBeNull();
    expect(history.entries()).toHaveLength(0);
  });

  it('a transaction directly inside a transaction still throws', async () => {
    const { history } = setup();
    await expect(history.transaction(async () => { await history.transaction(() => {}); })).rejects.toThrow(
      /nested transactions/,
    );
  });

  it('an Undo clicked while another dispatch is in flight fails (retryable), and works once it is idle', async () => {
    const { adapter, registry, trash, resolve, undoSeams } = setup();
    let release!: () => void;
    registry.registerAll([
      defineCommand({
        id: 'app.slow',
        title: 'Slow',
        execute: async () => {
          await new Promise<void>((r) => {
            release = r;
          });
          return ok(undefined);
        },
      }),
    ]);
    const offers: UndoOffer[] = [];
    const plan = await planSelection(trash, undefined, { kind: 'ids', ids: ['a', 'b'] }, {
      resolve,
      offer: (o) => offers.push(o),
      ...undoSeams,
    });
    await plan.go();
    expect(adapter.getState().trashed).toEqual({ a: true, b: true });

    const slow = registry.dispatch('app.slow', {});
    await expect(offers[0]!.undo()).rejects.toThrow(); // busy: not a conflict, nothing cached
    release();
    await slow;

    expect(await offers[0]!.undo()).toEqual({ restored: 2, conflicts: 0 });
    expect(adapter.getState().trashed).toEqual({ a: false, b: false });
  });
});
