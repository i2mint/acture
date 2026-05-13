/**
 * Canvas-click → selection update.
 *
 * Every selection mutation, even from a UI handler, goes through the
 * registry. We do NOT call `state.setState` here — the only mutation
 * path is `registry.dispatch('app.selection.set', ...)`.
 */

import { registry } from './registry.js';
import { state } from './state.js';

export function selectNode(nodeId: string, multi: boolean): void {
  const current = state.getState().selectedNodes;
  let nextIds: string[];
  if (multi) {
    nextIds = current.includes(nodeId)
      ? current.filter((id) => id !== nodeId)
      : [...current, nodeId];
  } else {
    nextIds = [nodeId];
  }
  void registry.dispatch('app.selection.set', { ids: nextIds });
}

export function clearSelection(): void {
  void registry.dispatch('app.selection.set', { ids: [] });
}
