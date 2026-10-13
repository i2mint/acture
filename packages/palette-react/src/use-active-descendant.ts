/**
 * Keep the combobox input's `aria-activedescendant` on the highlighted option.
 *
 * cmdk 1.1.1 highlights the first option on mount (`aria-selected="true"`) but
 * only publishes its id on the input once the highlight *moves*, so a screen
 * reader does not hear the first option until the first arrow key (#68). cmdk
 * overrides any `aria-activedescendant` prop and its controlled `value` is
 * applied without publishing, so neither is a seam. The one source of truth it
 * does keep correct is the option's `aria-selected`; this mirrors it.
 *
 * Returns a callback ref for cmdk's root element. It follows the root through
 * remounts (the palette swaps the list for a picker chain and back).
 */

import { useCallback, useRef } from 'react';

const INPUT = '[cmdk-input]';
const SELECTED_ITEM = '[cmdk-item][aria-selected="true"]';

/** Make the input's `aria-activedescendant` name the selected option. */
export function syncActiveDescendant(root: Element): void {
  const input = root.querySelector(INPUT);
  if (!input) return;
  const id = root.querySelector(SELECTED_ITEM)?.id;
  if (id) {
    if (input.getAttribute('aria-activedescendant') !== id) {
      input.setAttribute('aria-activedescendant', id);
    }
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

export function useActiveDescendant(): (root: HTMLElement | null) => void {
  const observer = useRef<MutationObserver | null>(null);
  return useCallback((root: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!root) return;
    syncActiveDescendant(root);
    if (typeof MutationObserver === 'undefined') return;
    const watcher = new MutationObserver(() => syncActiveDescendant(root));
    watcher.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });
    observer.current = watcher;
  }, []);
}
