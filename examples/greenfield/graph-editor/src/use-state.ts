/**
 * Subscribe to the zustand-backed state adapter from React.
 *
 * We use `useSyncExternalStore` so the same adapter that powers
 * non-React surfaces (CLI / MCP / tests) drives React renders too.
 */

import { useSyncExternalStore } from 'react';
import { state, type GraphState } from './state.js';

export function useGraphState<T>(selector: (s: GraphState) => T): T {
  return useSyncExternalStore(
    (listener) => state.subscribe(listener),
    () => selector(state.getState()),
    () => selector(state.getState()),
  );
}
