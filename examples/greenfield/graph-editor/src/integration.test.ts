import { describe, it, expect } from 'vitest';
import { registry } from './registry.js';
import { state, initialGraphState } from './state.js';
import { isOk } from 'acture';

function snapshot() {
  return JSON.parse(JSON.stringify(state.getState()));
}

describe('graph-editor — integration', () => {
  it('starts in the documented initial state', () => {
    // Note: import-order effect: registry construction runs commands
    // that don't mutate. The initial state should still match.
    expect(snapshot()).toEqual(initialGraphState);
  });

  it('addNode → connectNodes → deleteEdge round trip via dispatch', async () => {
    // Reset state for this test
    await registry.dispatch('app.dev.resetState');

    // 1. Add a fresh node via the parameterized command.
    const add = await registry.dispatch<{ nodeId: string }>(
      'app.graph.addNode',
      { x: 320, y: 300, label: 'D' },
    );
    expect(isOk(add)).toBe(true);
    if (!add.ok) throw new Error('addNode failed');
    const newId = add.value.nodeId;
    expect(state.getState().nodes[newId]).toMatchObject({ label: 'D' });

    // 2. Select n1 and the new node, then connect them.
    await registry.dispatch('app.selection.set', { ids: ['n1', newId] });
    const ctx = {
      selection: { length: 2, ids: ['n1', newId] },
    };
    const connect = await registry.dispatch<{ edgeId: string }>(
      'app.graph.connectNodes',
      undefined,
      ctx,
    );
    expect(isOk(connect)).toBe(true);
    if (!connect.ok) throw new Error('connectNodes failed');
    expect(state.getState().edges[connect.value.edgeId]).toBeDefined();

    // 3. Delete that edge.
    const del = await registry.dispatch('app.graph.deleteEdge', undefined, ctx);
    expect(isOk(del)).toBe(true);
    expect(state.getState().edges[connect.value.edgeId]).toBeUndefined();
  });

  it('rejects connectNodes without a 2-node selection (when-clause)', async () => {
    const result = await registry.dispatch('app.graph.connectNodes', undefined, {
      selection: { length: 1, ids: ['n1'] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['when_clause_failed', 'bad_selection']).toContain(result.error.code);
    }
  });

  it('JSON.stringify(state) round-trips', async () => {
    await registry.dispatch('app.dev.resetState');
    const before = state.getState();
    const json = JSON.stringify(before);
    const after = JSON.parse(json);
    expect(after).toEqual(before);
  });

  it('addNode + setStateWithPatches survives JSON round-trip', async () => {
    await registry.dispatch('app.dev.resetState');
    await registry.dispatch('app.graph.addNode', { x: 1, y: 2, label: 'X' });
    await registry.dispatch('app.graph.addNode', { x: 3, y: 4, label: 'Y' });
    await registry.dispatch('app.selection.set', { ids: ['n1'] });
    const json = JSON.stringify(state.getState());
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(state.getState());
  });

  it('toggleGrid is reversible', async () => {
    await registry.dispatch('app.dev.resetState');
    const before = state.getState().view.showGrid;
    await registry.dispatch('app.view.toggleGrid');
    expect(state.getState().view.showGrid).toBe(!before);
    await registry.dispatch('app.view.toggleGrid');
    expect(state.getState().view.showGrid).toBe(before);
  });

  it('selectAll selects every node', async () => {
    await registry.dispatch('app.dev.resetState');
    const result = await registry.dispatch<{ count: number }>('app.selection.selectAll');
    expect(isOk(result)).toBe(true);
    const allIds = Object.keys(state.getState().nodes);
    expect(state.getState().selectedNodes).toEqual(allIds);
  });
});
