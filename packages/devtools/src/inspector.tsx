/**
 * `<Inspector />` — embeddable React component for inspecting an acture
 * registry in dev builds. Three sections:
 *
 *   1. Commands — filterable list with tier badges, descriptions, when.
 *   2. Dispatch log — recent dispatches (wires through
 *      `instrumentRegistry` if provided).
 *   3. When evaluator — small text input that compiles + evaluates a
 *      when-clause against an arbitrary JSON context, useful for
 *      debugging palette visibility.
 *
 * Styling: minimal inline styles only. No design-system dep. The host
 * can theme via the `data-acture-devtools-*` attributes.
 */

/// <reference lib="dom" />

import { useMemo, useState, useSyncExternalStore } from 'react';
import type {
  AnyCommandRecord,
  Context,
  Registry,
  Tier,
} from 'acture';
import { compileWhen } from 'acture';
import type { DispatchLog, DispatchLogEntry } from './dispatch-log.js';

export interface InspectorProps {
  /** The acture registry to inspect. */
  readonly registry: Registry;
  /** Optional dispatch log produced by `instrumentRegistry(registry)`.
   *  If absent, the dispatch-log tab is hidden. */
  readonly log?: DispatchLog;
  /** Initial tier filter. Default: 'all'. */
  readonly initialTiers?: readonly Tier[] | 'all';
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

type Tab = 'commands' | 'log' | 'when';

const ALL_TIERS: readonly Tier[] = ['stable', 'experimental', 'deprecated', 'internal'];

export function Inspector(props: InspectorProps): React.ReactElement {
  const { registry, log, initialTiers = 'all', className, style } = props;

  const [tab, setTab] = useState<Tab>('commands');
  const [tiers, setTiers] = useState<readonly Tier[] | 'all'>(initialTiers);
  const [filter, setFilter] = useState('');

  // Subscribe to registry changes so the commands view stays fresh.
  const revision = useSyncExternalStore(
    (onChange) => registry.onCommandsChanged(() => onChange()),
    () => registry.size(),
    () => 0,
  );

  const commands = useMemo<readonly AnyCommandRecord[]>(() => {
    const list = registry.list({ tiers });
    if (filter.trim().length === 0) return list;
    const f = filter.toLowerCase();
    return list.filter(
      (c) =>
        c.id.toLowerCase().includes(f) ||
        c.title.toLowerCase().includes(f) ||
        (c.description ?? '').toLowerCase().includes(f),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, revision, tiers, filter]);

  return (
    <div
      className={className}
      data-acture-devtools-inspector
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        border: '1px solid #ccc',
        borderRadius: 6,
        background: '#fafafa',
        color: '#222',
        padding: 12,
        ...style,
      }}
    >
      <div data-acture-devtools-tabbar style={tabBarStyle}>
        <TabButton active={tab === 'commands'} onClick={() => setTab('commands')}>
          Commands ({commands.length})
        </TabButton>
        {log ? (
          <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
            Dispatch log ({log.entries.length})
          </TabButton>
        ) : null}
        <TabButton active={tab === 'when'} onClick={() => setTab('when')}>
          When evaluator
        </TabButton>
      </div>
      {tab === 'commands' ? (
        <CommandsView
          commands={commands}
          tiers={tiers}
          setTiers={setTiers}
          filter={filter}
          setFilter={setFilter}
        />
      ) : null}
      {tab === 'log' && log ? <DispatchLogView log={log} /> : null}
      {tab === 'when' ? <WhenView /> : null}
    </div>
  );
}

/* ─────────────────────────── tabs ──────────────────────────────────── */

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        background: props.active ? '#fff' : 'transparent',
        border: '1px solid #ccc',
        borderBottomColor: props.active ? '#fff' : '#ccc',
        padding: '4px 10px',
        marginRight: 4,
        marginBottom: -1,
        cursor: 'pointer',
        fontWeight: props.active ? 600 : 400,
        fontSize: 12,
      }}
    >
      {props.children}
    </button>
  );
}

/* ────────────────────────── commands view ─────────────────────────── */

function CommandsView(props: {
  commands: readonly AnyCommandRecord[];
  tiers: readonly Tier[] | 'all';
  setTiers: (t: readonly Tier[] | 'all') => void;
  filter: string;
  setFilter: (f: string) => void;
}): React.ReactElement {
  return (
    <div data-acture-devtools-commands>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="filter by id / title / description"
          value={props.filter}
          onChange={(e) => props.setFilter(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '4px 6px', fontSize: 12 }}
        />
        <TierFilter value={props.tiers} onChange={props.setTiers} />
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>id</th>
            <th style={thStyle}>title</th>
            <th style={thStyle}>tier</th>
            <th style={thStyle}>params</th>
            <th style={thStyle}>when</th>
          </tr>
        </thead>
        <tbody>
          {props.commands.map((c) => (
            <tr key={c.id}>
              <td style={tdStyle}>{c.id}</td>
              <td style={tdStyle}>{c.title}</td>
              <td style={tdStyle}>
                <TierBadge tier={(c.tier ?? 'stable') as Tier} />
              </td>
              <td style={tdStyle}>{c.params ? 'yes' : '—'}</td>
              <td style={tdStyle}>
                {c.when === undefined
                  ? '—'
                  : typeof c.when === 'string'
                    ? <code>{c.when}</code>
                    : <em>function</em>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TierFilter(props: {
  value: readonly Tier[] | 'all';
  onChange: (v: readonly Tier[] | 'all') => void;
}): React.ReactElement {
  const isAll = props.value === 'all';
  const set = new Set(Array.isArray(props.value) ? props.value : []);
  function toggle(t: Tier): void {
    if (isAll) {
      // Switching off "all" — start with everything but this one.
      props.onChange(ALL_TIERS.filter((x) => x !== t));
      return;
    }
    const next = new Set(set);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    if (next.size === ALL_TIERS.length) {
      props.onChange('all');
      return;
    }
    props.onChange(Array.from(next));
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 11, opacity: 0.7 }}>tiers:</span>
      {ALL_TIERS.map((t) => {
        const on = isAll || set.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            style={{
              fontSize: 11,
              padding: '2px 6px',
              border: '1px solid #ccc',
              borderRadius: 3,
              background: on ? tierColor(t) : '#fff',
              color: on ? '#fff' : '#666',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        background: tierColor(tier),
        color: '#fff',
        textTransform: 'uppercase',
      }}
    >
      {tier}
    </span>
  );
}

function tierColor(tier: Tier): string {
  switch (tier) {
    case 'stable': return '#2e7d32';
    case 'experimental': return '#f9a825';
    case 'deprecated': return '#c62828';
    case 'internal': return '#5f5f5f';
  }
}

/* ────────────────────────── dispatch log view ─────────────────────── */

function DispatchLogView({ log }: { log: DispatchLog }): React.ReactElement {
  const revision = useSyncExternalStore(
    (onChange) => log.subscribe(() => onChange()),
    () => log.entries.length,
    () => 0,
  );
  // `revision` re-triggers render; entries themselves are read fresh.
  void revision;
  return (
    <div data-acture-devtools-log>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, opacity: 0.7 }}>most recent first</span>
        <button
          type="button"
          onClick={() => log.clear()}
          style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
        >
          clear
        </button>
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>t</th>
            <th style={thStyle}>command</th>
            <th style={thStyle}>ok</th>
            <th style={thStyle}>params</th>
            <th style={thStyle}>result / error</th>
            <th style={thStyle}>ms</th>
          </tr>
        </thead>
        <tbody>
          {[...log.entries].reverse().map((e) => (
            <DispatchLogRow key={e.id} entry={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DispatchLogRow({ entry }: { entry: DispatchLogEntry }): React.ReactElement {
  const ok = entry.result.ok;
  const summary = ok
    ? JSON.stringify(entry.result.value).slice(0, 80)
    : `${entry.result.error.code}: ${entry.result.error.message.slice(0, 80)}`;
  return (
    <tr>
      <td style={tdStyle}>{formatTime(entry.timestamp)}</td>
      <td style={tdStyle}>{entry.commandId}</td>
      <td style={{ ...tdStyle, color: ok ? '#2e7d32' : '#c62828' }}>
        {ok ? '✓' : '✗'}
      </td>
      <td style={tdStyle}>
        <code>{truncate(JSON.stringify(entry.params), 60)}</code>
      </td>
      <td style={tdStyle}>
        <code>{truncate(summary, 80)}</code>
      </td>
      <td style={tdStyle}>{entry.durationMs.toFixed(1)}</td>
    </tr>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${(ms % 1000).toString().padStart(3, '0')}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

/* ────────────────────────── when evaluator view ───────────────────── */

function WhenView(): React.ReactElement {
  const [whenSrc, setWhenSrc] = useState('editor.focused == true');
  const [ctxSrc, setCtxSrc] = useState('{\n  "editor": { "focused": true }\n}');

  const evaluation = useMemo(() => {
    let ctx: Context;
    try {
      const parsed = JSON.parse(ctxSrc) as unknown;
      if (parsed === null || typeof parsed !== 'object') {
        return { error: 'context must be a JSON object' };
      }
      ctx = parsed as Context;
    } catch (e) {
      return { error: `context JSON: ${(e as Error).message}` };
    }
    try {
      const compiled = compileWhen(whenSrc);
      return { value: compiled.evaluate(ctx) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [whenSrc, ctxSrc]);

  return (
    <div data-acture-devtools-when style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <label style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>when-clause (DSL)</div>
        <textarea
          rows={4}
          value={whenSrc}
          onChange={(e) => setWhenSrc(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 12, padding: 6 }}
        />
      </label>
      <label style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>context (JSON)</div>
        <textarea
          rows={4}
          value={ctxSrc}
          onChange={(e) => setCtxSrc(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 12, padding: 6 }}
        />
      </label>
      <div
        style={{
          flexBasis: '100%',
          padding: 8,
          background: 'error' in evaluation ? '#fdecea' : '#e6f4ea',
          color: 'error' in evaluation ? '#c62828' : '#2e7d32',
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        {'error' in evaluation
          ? `Error: ${evaluation.error}`
          : `Result: ${String(evaluation.value)}`}
      </div>
    </div>
  );
}

/* ─────────────────────────── shared styles ────────────────────────── */

const tabBarStyle: React.CSSProperties = {
  borderBottom: '1px solid #ccc',
  marginBottom: 12,
  paddingBottom: 0,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #ccc',
  padding: '4px 6px',
  background: '#f5f5f5',
};

const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid #eee',
  padding: '3px 6px',
  verticalAlign: 'top',
};
