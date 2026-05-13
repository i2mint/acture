/**
 * Ctrl+K palette overlay. Wraps `<CommandPalette>` from
 * `@acture/palette-react` in a tiny modal. Builds the when-clause
 * context from current selection.
 */

import { useEffect, useState, useMemo } from 'react';
import { CommandPalette } from '@acture/palette-react';
import { registry } from './registry.js';
import { useGraphState } from './use-state.js';
import type { Context } from 'acture';

export function PaletteOverlay(): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const selectedNodes = useGraphState((s) => s.selectedNodes);

  // when-clause context: selection.length and selection.ids
  const context = useMemo<Context>(
    () => ({ selection: { length: selectedNodes.length, ids: selectedNodes } }),
    [selectedNodes],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ge-modal-backdrop"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div className="ge-modal-card" onClick={(e) => e.stopPropagation()}>
        <CommandPalette
          registry={registry}
          context={context}
          onDispatched={() => setOpen(false)}
          onParameterizedSelect={() => {
            // Phase 2 will collect params inside the palette. For now,
            // just close so the user knows the click registered.
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}
