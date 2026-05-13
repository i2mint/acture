/**
 * Graph-editor command definitions.
 *
 * EVERY mutation to `state` lives inside an `execute` handler — that is
 * Phase 1's central acceptance criterion. The Ctrl+K palette today and
 * the keyboard / MCP / AI surfaces in later phases all reach state
 * through `registry.dispatch`.
 *
 * Verified by an audit at acceptance time:
 *
 *     rg "store.setState|adapter\\.setState|state\\.setState"        \
 *        packages/ examples/greenfield/graph-editor/src/             \
 *        -t ts
 *
 * which must report zero matches outside this directory.
 *
 * The command list matches `docs/implementation_plan.md` §"Phase 1":
 * addNode (parameterized), removeNode, connectNodes, deleteEdge,
 * zoomToFit, selectAll, toggleGrid — plus a small `app.selection.set`
 * for canvas-click selection (used internally by the UI, dispatched
 * via the registry just like every other mutation).
 */

import { z } from 'zod';
import { defineCommand, ok, err } from 'acture';
import type { StateAdapter, NodeRecord } from '../state.js';
import { initialGraphState } from '../state.js';

interface SelectionCtxShape {
  length: number;
  ids: readonly string[];
}

function readSelection(ctx: Record<string, unknown>): SelectionCtxShape {
  const sel = ctx['selection'] as SelectionCtxShape | undefined;
  return sel ?? { length: 0, ids: [] };
}

export function buildCommands(state: StateAdapter) {
  return [
    /* ────────── Graph mutations ────────── */

    /**
     * The one user-facing parameterized command in Phase 1. Surfaces
     * in the palette with a "Phase 2" badge — the picker chain UX
     * ships in Phase 2. Reachable from tests and from any future
     * MCP/AI surface today via `registry.dispatch(...)`.
     */
    defineCommand({
      id: 'app.graph.addNode',
      title: 'Add node',
      description: 'Add a node to the graph at the given coordinates.',
      category: 'Graph',
      params: z.object({
        x: z.number().describe('Canvas x in pixels'),
        y: z.number().describe('Canvas y in pixels'),
        label: z.string().min(1).max(40),
      }),
      execute: (params) => {
        let createdId = '';
        state.setStateWithPatches((draft) => {
          const id = `n${draft.nextNodeNum}`;
          draft.nextNodeNum += 1;
          draft.nodes[id] = { id, x: params.x, y: params.y, label: params.label };
          createdId = id;
        });
        return ok({ nodeId: createdId });
      },
    }),

    defineCommand({
      id: 'app.graph.removeNode',
      title: 'Remove node',
      description: 'Delete every selected node and the edges incident to it.',
      category: 'Graph',
      keybinding: 'Delete',
      when: 'selection.length >= 1',
      execute: (_params, ctx) => {
        const sel = readSelection(ctx);
        if (sel.length === 0) return err('nothing_selected', 'No nodes selected');
        const removed: string[] = [];
        const set = new Set<string>(sel.ids);
        state.setStateWithPatches((draft) => {
          for (const id of sel.ids) {
            if (draft.nodes[id]) {
              delete draft.nodes[id];
              removed.push(id);
            }
          }
          for (const [eid, edge] of Object.entries(draft.edges)) {
            if (set.has(edge.from) || set.has(edge.to)) delete draft.edges[eid];
          }
          draft.selectedNodes = [];
        });
        return ok({ removedNodes: removed });
      },
    }),

    defineCommand({
      id: 'app.graph.renameNode',
      title: 'Rename node',
      description: 'Change the label of an existing node.',
      category: 'Graph',
      params: z.object({
        nodeId: z.string(),
        label: z.string().min(1),
      }),
      execute: (params) => {
        if (!state.getState().nodes[params.nodeId]) {
          return err('unknown_node', `No node with id ${params.nodeId}`);
        }
        state.setStateWithPatches((draft) => {
          const node = draft.nodes[params.nodeId];
          if (node) node.label = params.label;
        });
        return ok({ nodeId: params.nodeId, label: params.label });
      },
    }),

    defineCommand({
      id: 'app.graph.connectNodes',
      title: 'Connect nodes',
      description: 'Create an edge from the first to the second selected node.',
      category: 'Graph',
      when: 'selection.length == 2',
      execute: (_params, ctx) => {
        const sel = readSelection(ctx);
        if (sel.length !== 2) {
          return err('bad_selection', 'Connect requires exactly 2 selected nodes');
        }
        const [from, to] = sel.ids;
        if (!from || !to) return err('bad_selection', 'Two-node selection expected');
        let createdId = '';
        state.setStateWithPatches((draft) => {
          const id = `e${draft.nextEdgeNum}`;
          draft.nextEdgeNum += 1;
          draft.edges[id] = { id, from, to };
          createdId = id;
        });
        return ok({ edgeId: createdId });
      },
    }),

    defineCommand({
      id: 'app.graph.deleteEdge',
      title: 'Delete edge',
      description: 'Delete every edge between the two selected nodes.',
      category: 'Graph',
      when: 'selection.length == 2',
      execute: (_params, ctx) => {
        const sel = readSelection(ctx);
        const set = new Set<string>(sel.ids);
        const removed: string[] = [];
        state.setStateWithPatches((draft) => {
          for (const [eid, edge] of Object.entries(draft.edges)) {
            if (set.has(edge.from) && set.has(edge.to)) {
              delete draft.edges[eid];
              removed.push(eid);
            }
          }
        });
        if (removed.length === 0) {
          return err('no_edges', 'No edges connect the selected nodes');
        }
        return ok({ removedEdges: removed });
      },
    }),

    /* ────────── View ────────── */

    defineCommand({
      id: 'app.view.zoomToFit',
      title: 'Zoom to fit',
      description: 'Recenter the canvas to fit every node.',
      category: 'View',
      keybinding: '$mod+0',
      execute: () => {
        state.setStateWithPatches((draft) => {
          const nodes = Object.values(draft.nodes) as NodeRecord[];
          if (nodes.length === 0) {
            draft.view = { ...draft.view, scale: 1, offsetX: 0, offsetY: 0 };
            return;
          }
          let minX = Infinity,
            minY = Infinity;
          for (const n of nodes) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
          }
          const pad = 60;
          draft.view.offsetX = pad - minX;
          draft.view.offsetY = pad - minY;
          draft.view.scale = 1;
        });
        return ok(undefined);
      },
    }),

    defineCommand({
      id: 'app.view.toggleGrid',
      title: 'Toggle grid',
      category: 'View',
      keybinding: 'g',
      execute: () => {
        let next = false;
        state.setStateWithPatches((draft) => {
          draft.view.showGrid = !draft.view.showGrid;
          next = draft.view.showGrid;
        });
        return ok({ showGrid: next });
      },
    }),

    /* ────────── Selection ────────── */

    defineCommand({
      id: 'app.selection.selectAll',
      title: 'Select all nodes',
      category: 'Selection',
      keybinding: '$mod+a',
      execute: () => {
        const allIds: string[] = [];
        state.setStateWithPatches((draft) => {
          allIds.push(...Object.keys(draft.nodes));
          draft.selectedNodes = allIds;
        });
        return ok({ count: allIds.length });
      },
    }),

    /**
     * Test/dev helper: reset state to the documented initial value.
     * `@internal` tier — never appears in the user-facing palette or
     * MCP/AI surfaces. Exists so integration tests can rewind without
     * touching `state.setState` directly.
     */
    defineCommand({
      id: 'app.dev.resetState',
      title: 'Reset state (dev only)',
      tier: 'internal',
      execute: () => {
        state.setStateWithPatches((draft) => {
          // Object.assign-into-draft so we replace every top-level key.
          Object.assign(draft, structuredClone(initialGraphState));
        });
        return ok(undefined);
      },
    }),

    /**
     * Parameterized helper used by canvas-click in the UI. NOT shown
     * in the palette as a user-pickable command (it appears with the
     * Phase-2 badge); UIs invoke it via `registry.dispatch('app.selection.set', ...)`.
     */
    defineCommand({
      id: 'app.selection.set',
      title: 'Set selection',
      description: 'Replace the current selection with the given node ids.',
      category: 'Selection',
      params: z.object({ ids: z.array(z.string()) }),
      execute: (params) => {
        state.setStateWithPatches((draft) => {
          draft.selectedNodes = [...params.ids];
        });
        return ok({ count: params.ids.length });
      },
    }),
  ];
}
