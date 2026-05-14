/**
 * Ctrl/Cmd+K palette overlay. Phase 2 wiring:
 *  - Opens on Ctrl/Cmd+K (handled here so the palette stays a single
 *    component; in a real app the keybinding could itself flow through
 *    `acture-hotkeys`).
 *  - Closes on Esc / outside-click / successful dispatch.
 *  - Renders acture-forms-autoform inline for `kind: 'handoff'`
 *    commands (e.g. `app.graph.addNode({x, y, label})`).
 *  - Atomic parameterized commands (none in the worked example today,
 *    but the picker chain is wired and ready) render the picker chain
 *    automatically.
 */

import { useEffect, useState, useMemo } from 'react';
import { CommandPalette } from 'acture-palette-react';
import { AutoForm } from 'acture-forms-autoform';
import { registry } from './registry.js';
import { useGraphState } from './use-state.js';
import type { Context } from 'acture';

export function PaletteOverlay(): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const selectedNodes = useGraphState((s) => s.selectedNodes);

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
          formAdapter={AutoForm}
          onDispatched={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
