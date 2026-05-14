/**
 * Graph-editor state shape — a tiny directed graph + view + selection.
 *
 * `JSON.stringify(state)` must round-trip cleanly (Phase 1 acceptance #5).
 * That rules out Sets, Maps, Date, etc. in the state.
 */

import { createZustandAdapter } from 'acture-state-zustand';

export interface NodeRecord {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface EdgeRecord {
  id: string;
  from: string;
  to: string;
}

export interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
  showGrid: boolean;
}

export interface GraphState {
  nodes: Record<string, NodeRecord>;
  edges: Record<string, EdgeRecord>;
  selectedNodes: string[];
  view: ViewState;
  nextNodeNum: number;
  nextEdgeNum: number;
}

export const initialGraphState: GraphState = {
  nodes: {
    n1: { id: 'n1', x: 80, y: 80, label: 'A' },
    n2: { id: 'n2', x: 260, y: 120, label: 'B' },
    n3: { id: 'n3', x: 160, y: 240, label: 'C' },
  },
  edges: {
    e1: { id: 'e1', from: 'n1', to: 'n2' },
  },
  selectedNodes: [],
  view: { scale: 1, offsetX: 0, offsetY: 0, showGrid: true },
  nextNodeNum: 4,
  nextEdgeNum: 2,
};

export const state = createZustandAdapter<GraphState>({
  initialState: initialGraphState,
});

export type StateAdapter = typeof state;
