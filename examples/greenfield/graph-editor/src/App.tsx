import { useMemo, useState } from 'react';
import { useHotkeys } from 'acture-hotkeys/react';
import { Inspector, instrumentRegistry } from 'acture-devtools';
import { Canvas } from './Canvas.js';
import { PaletteOverlay } from './Palette.js';
import { clearSelection } from './select-node.js';
import { useGraphState } from './use-state.js';
import { registry } from './registry.js';
import type { Context } from 'acture';

// Instrument once at module load so every dispatch through this
// registry is captured by the devtools dispatch log. Idempotent —
// re-imports do not re-wrap.
const dispatchLog = instrumentRegistry(registry);

export function App(): React.ReactElement {
  const selectedNodes = useGraphState((s) => s.selectedNodes);
  const selectedCount = selectedNodes.length;
  const [showInspector, setShowInspector] = useState(false);

  // Build the when-clause context for hotkey availability filtering.
  // The same selection.length / selection.ids that the palette uses.
  const hotkeyContext = useMemo<Context>(
    () => ({ selection: { length: selectedCount, ids: selectedNodes } }),
    [selectedCount, selectedNodes],
  );

  // Bind every command's keybinding via the registry. First-registered-
  // wins under matching context (per acture-hotkeys spec).
  useHotkeys(registry, { context: hotkeyContext });

  return (
    <div className="ge-app">
      <header className="ge-header">
        <h1>acture · graph editor</h1>
        <span className="ge-hint">
          Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> to open the command palette.
        </span>
        <span className="ge-status">
          {selectedCount === 0
            ? 'No nodes selected'
            : `${selectedCount} node${selectedCount === 1 ? '' : 's'} selected`}
        </span>
        <button
          type="button"
          className="ge-inspector-toggle"
          onClick={() => setShowInspector((v) => !v)}
        >
          {showInspector ? 'Hide' : 'Show'} inspector
        </button>
      </header>
      <main className="ge-canvas-wrap" onClick={() => clearSelection()}>
        <Canvas />
      </main>
      <PaletteOverlay />
      {showInspector ? (
        <div className="ge-inspector-panel">
          <Inspector registry={registry} log={dispatchLog} />
        </div>
      ) : null}
    </div>
  );
}
