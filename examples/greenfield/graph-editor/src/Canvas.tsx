/**
 * SVG canvas. Read-only view of the graph state, with a click-to-select
 * interaction that updates the selection via — wait for it —
 * `registry.dispatch`. Phase 1 only ships parameter-free dispatch, so
 * we dispatch `app.selection.clear` / `app.selection.selectAll` via the
 * registry, and for individual-node-click we route through a small
 * "set selection" handler that lives only inside the example's
 * dispatcher facade in `select-node.ts`.
 */

import { useGraphState } from './use-state.js';
import { state } from './state.js';
import { selectNode } from './select-node.js';
import type { EdgeRecord, NodeRecord } from './state.js';

export function Canvas(): React.ReactElement {
  const view = useGraphState((s) => s.view);
  const nodes = useGraphState((s) => Object.values(s.nodes) as NodeRecord[]);
  const edges = useGraphState((s) => Object.values(s.edges) as EdgeRecord[]);
  const selectedNodes = useGraphState((s) => s.selectedNodes);

  return (
    <svg className="ge-canvas" width="100%" height="100%">
      {view.showGrid ? <Grid /> : null}
      <g transform={`translate(${view.offsetX} ${view.offsetY}) scale(${view.scale})`}>
        {edges.map((e) => {
          const a = state.getState().nodes[e.from];
          const b = state.getState().nodes[e.to];
          if (!a || !b) return null;
          return (
            <line
              key={e.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeOpacity={0.5}
              strokeWidth={2}
            />
          );
        })}
        {nodes.map((n) => {
          const selected = selectedNodes.includes(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              onClick={(e) => {
                e.stopPropagation();
                selectNode(n.id, e.shiftKey);
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={22}
                fill={selected ? '#5b8def' : '#fff'}
                stroke={selected ? '#1c4eb3' : '#666'}
                strokeWidth={2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fill={selected ? '#fff' : '#222'}
                fontSize={14}
                pointerEvents="none"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function Grid(): React.ReactElement {
  const cells: React.ReactElement[] = [];
  for (let x = 0; x < 1200; x += 20) {
    cells.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={800} stroke="#eee" strokeWidth={1} />);
  }
  for (let y = 0; y < 800; y += 20) {
    cells.push(<line key={`h${y}`} x1={0} y1={y} x2={1200} y2={y} stroke="#eee" strokeWidth={1} />);
  }
  return <g>{cells}</g>;
}
