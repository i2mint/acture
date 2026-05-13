import { Canvas } from './Canvas.js';
import { PaletteOverlay } from './Palette.js';
import { clearSelection } from './select-node.js';
import { useGraphState } from './use-state.js';

export function App(): React.ReactElement {
  const selectedCount = useGraphState((s) => s.selectedNodes.length);
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
      </header>
      <main
        className="ge-canvas-wrap"
        onClick={() => clearSelection()}
      >
        <Canvas />
      </main>
      <PaletteOverlay />
    </div>
  );
}
