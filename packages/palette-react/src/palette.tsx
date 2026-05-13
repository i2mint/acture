/**
 * `<CommandPalette />` — Phase 1 implementation.
 *
 * Wraps cmdk's `<Command>` primitive. The host app supplies the modal
 * shell (cmdk's `<Command.Dialog>` or the host's own overlay); this
 * component renders the input + list + items.
 *
 * Per `acture-hard-donts` skill: no bundled UI kit. All elements use
 * cmdk's built-in classes plus consumer-supplied className overrides.
 * The host adds styles via CSS.
 */

import { Command } from 'cmdk';
import { useMemo } from 'react';
import type {
  AnyCommandRecord,
  Context,
  Registry,
  Result,
  Tier,
} from 'acture';
import { useCommandsChanged } from './use-commands-changed.js';

export type PaletteItemRenderer = (cmd: AnyCommandRecord) => React.ReactNode;

export interface CommandPaletteProps {
  /** The acture registry. */
  registry: Registry;
  /** Optional context for when-clause filtering. If omitted, all
   *  commands pass (when-clauses are evaluated as always-true). */
  context?: Context;
  /** Tier filter. Default: `['stable']`. */
  tiers?: readonly Tier[] | 'all';
  /** Called when the user picks a command. After a successful
   *  parameter-free dispatch, the palette host typically closes the
   *  palette here. */
  onDispatched?: (cmd: AnyCommandRecord, result: Result<unknown>) => void;
  /** Called instead of dispatching when the user selects a command
   *  with a `params` schema. Phase 1 cannot collect params, so the
   *  host can show a "coming in Phase 2" notice or open its own form. */
  onParameterizedSelect?: (cmd: AnyCommandRecord) => void;
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Optional className for the root `<Command>` container. */
  className?: string;
  /** Optional custom item renderer (right-aligned text, etc.). The
   *  default renders the title, keybinding hint, and a "Phase 2" badge
   *  on parameterized commands. */
  renderItem?: PaletteItemRenderer;
}

/**
 * Phase 1 command palette. Renders a cmdk `<Command>` listing
 * registry contents, grouped by category, sorted by `defaultScore`
 * (numbers only — function-form `defaultScore` is treated as 0).
 */
export function CommandPalette(props: CommandPaletteProps): React.ReactElement {
  const {
    registry,
    context,
    tiers,
    onDispatched,
    onParameterizedSelect,
    placeholder = 'Type a command…',
    className,
    renderItem,
  } = props;

  // Re-render whenever the registry's command set changes.
  const revision = useCommandsChanged(registry);

  // Resolve the visible command list. Memoized on revision/context/tiers.
  const groups = useMemo(() => {
    const list = registry.list({
      tiers: tiers ?? ['stable'],
      ...(context !== undefined ? { context } : {}),
    });
    return groupByCategory(list);
    // `revision` is the registry-change cache key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, revision, tiers, context]);

  async function dispatchById(id: string): Promise<void> {
    const cmd = registry.get(id);
    if (!cmd) return;
    if (cmd.params !== undefined) {
      onParameterizedSelect?.(cmd);
      return;
    }
    const result = await registry.dispatch(id, undefined, context);
    onDispatched?.(cmd, result);
  }

  return (
    <Command className={className} label="Command palette">
      <Command.Input placeholder={placeholder} />
      <Command.List>
        <Command.Empty>No matching commands.</Command.Empty>
        {groups.map(([category, items]) => (
          <Command.Group key={category} heading={category}>
            {items.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={paletteValue(cmd)}
                keywords={cmd.aliases ? [...cmd.aliases] : undefined}
                onSelect={() => {
                  void dispatchById(cmd.id);
                }}
              >
                {renderItem ? renderItem(cmd) : <DefaultItem cmd={cmd} />}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}

/* ───────────────────────── default rendering ──────────────────────── */

function DefaultItem({ cmd }: { cmd: AnyCommandRecord }): React.ReactElement {
  const isParameterized = cmd.params !== undefined;
  const keybinding = formatKeybinding(cmd.keybinding);
  return (
    <span
      data-acture-palette-item
      data-acture-parameterized={isParameterized ? '' : undefined}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flex: 1 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {cmd.icon ? <span aria-hidden="true">{cmd.icon}</span> : null}
        <span>{cmd.title}</span>
        {isParameterized ? (
          <span
            data-acture-phase2-badge
            style={{
              fontSize: '0.75em',
              opacity: 0.7,
              padding: '0 4px',
              border: '1px solid currentColor',
              borderRadius: 4,
            }}
          >
            Phase&nbsp;2
          </span>
        ) : null}
      </span>
      {keybinding ? (
        <kbd style={{ fontSize: '0.85em', opacity: 0.7 }}>{keybinding}</kbd>
      ) : null}
    </span>
  );
}

/* ─────────────────────────── helpers ──────────────────────────────── */

function paletteValue(cmd: AnyCommandRecord): string {
  // cmdk filters by `value`; we concatenate title + id + aliases so
  // both natural-language search and id search work.
  const parts = [cmd.title, cmd.id];
  if (cmd.aliases) parts.push(...cmd.aliases);
  if (cmd.category) parts.push(cmd.category);
  return parts.join(' ');
}

function formatKeybinding(kb: AnyCommandRecord['keybinding']): string | null {
  if (kb === undefined) return null;
  if (typeof kb === 'string') return kb;
  if (kb.length === 0) return null;
  return kb[0] ?? null;
}

function groupByCategory(
  list: readonly AnyCommandRecord[],
): readonly (readonly [string, readonly AnyCommandRecord[]])[] {
  const groups = new Map<string, AnyCommandRecord[]>();
  const ordered: string[] = [];
  for (const cmd of list) {
    const category = cmd.category ?? 'Commands';
    if (!groups.has(category)) {
      groups.set(category, []);
      ordered.push(category);
    }
    groups.get(category)!.push(cmd);
  }
  // Sort each group by defaultScore (descending), then by title.
  for (const items of groups.values()) {
    items.sort((a, b) => {
      const sa = scoreOf(a);
      const sb = scoreOf(b);
      if (sa !== sb) return sb - sa;
      return a.title.localeCompare(b.title);
    });
  }
  return ordered.map((cat) => [cat, groups.get(cat) as readonly AnyCommandRecord[]] as const);
}

function scoreOf(cmd: AnyCommandRecord): number {
  if (typeof cmd.defaultScore === 'number') return cmd.defaultScore;
  return 0;
}
