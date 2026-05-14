/**
 * `<CommandPalette />` — Phase 2 implementation.
 *
 * Adds parameterized-command support per research-2 §9 (and the
 * `acture-palette-design` skill):
 *
 *   - `deriveKind(command)` returns 'atomic' | 'handoff'. Authors may
 *     override via `record.kind`.
 *   - 'atomic' commands render an inline picker chain INSIDE the
 *     palette (Linear / Discord chip-style).
 *   - 'handoff' commands either render a host-supplied form inline
 *     (when `formAdapter` is provided) or fall back to firing
 *     `onParameterizedSelect` for the host to open its own form view.
 *
 * Phase 1 behavior is preserved for parameter-free commands and for
 * hosts that supply neither a form adapter nor a parameterized-select
 * callback — the palette just closes the picker view.
 *
 * Per `acture-hard-donts` skill: no bundled UI kit. All elements use
 * cmdk's built-in classes plus consumer-supplied className overrides.
 */

/// <reference lib="dom" />

import { Command } from 'cmdk';
import { useMemo, useState } from 'react';
import type {
  AnyCommandRecord,
  Context,
  Registry,
  Result,
  Tier,
} from 'acture';
import { useCommandsChanged } from './use-commands-changed.js';
import { deriveKind } from './derive-kind.js';
import { PickerChain } from './picker-chain.js';

export type PaletteItemRenderer = (cmd: AnyCommandRecord) => React.ReactNode;

/** Props the palette passes to a host-supplied form adapter. The host
 *  renders a form derived from `command.params` and calls `onSubmit`
 *  with the validated params (or `onCancel`). */
export interface PaletteFormAdapterProps {
  command: AnyCommandRecord;
  defaults?: Record<string, unknown>;
  onSubmit: (params: unknown) => void;
  onCancel: () => void;
}

export type PaletteFormAdapter = React.ComponentType<PaletteFormAdapterProps>;

export interface CommandPaletteProps {
  /** The acture registry. */
  registry: Registry;
  /** Optional context for when-clause filtering and dispatch. */
  context?: Context;
  /** Tier filter. Default: `['stable']`. */
  tiers?: readonly Tier[] | 'all';
  /** Called when a dispatch (parameter-free OR parameterized) finishes. */
  onDispatched?: (cmd: AnyCommandRecord, result: Result<unknown>) => void;
  /** Fired when the user picks a `handoff` command and no `formAdapter`
   *  is configured. Hosts that want to open their own form view should
   *  handle this. */
  onParameterizedSelect?: (cmd: AnyCommandRecord) => void;
  /** Optional form adapter for `handoff` commands. When present, the
   *  palette switches its inner view to this component instead of
   *  closing. Plug in `acture-forms-autoform` or `acture-forms-rjsf`. */
  formAdapter?: PaletteFormAdapter;
  /** Per-field defaults injected into the picker chain / form. Useful
   *  for context-aware prefill (Things-style — research-2 §9.4). */
  paramDefaults?: (cmd: AnyCommandRecord) => Record<string, unknown> | undefined;
  placeholder?: string;
  className?: string;
  /** Custom item renderer for the list view. */
  renderItem?: PaletteItemRenderer;
}

type View =
  | { kind: 'list' }
  | { kind: 'pickerChain'; cmd: AnyCommandRecord; defaults?: Record<string, unknown> }
  | { kind: 'form'; cmd: AnyCommandRecord; defaults?: Record<string, unknown> };

export function CommandPalette(props: CommandPaletteProps): React.ReactElement {
  const {
    registry,
    context,
    tiers,
    onDispatched,
    onParameterizedSelect,
    formAdapter,
    paramDefaults,
    placeholder = 'Type a command…',
    className,
    renderItem,
  } = props;

  const revision = useCommandsChanged(registry);
  const [view, setView] = useState<View>({ kind: 'list' });

  const groups = useMemo(() => {
    const list = registry.list({
      tiers: tiers ?? ['stable'],
      ...(context !== undefined ? { context } : {}),
    });
    return groupByCategory(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, revision, tiers, context]);

  async function dispatchCommand(cmd: AnyCommandRecord, params?: unknown): Promise<void> {
    const result = await registry.dispatch(cmd.id, params, context);
    onDispatched?.(cmd, result);
    setView({ kind: 'list' });
  }

  function selectFromList(id: string): void {
    const cmd = registry.get(id);
    if (!cmd) return;
    if (cmd.params === undefined) {
      void dispatchCommand(cmd);
      return;
    }
    const defaults = paramDefaults?.(cmd);
    const kind = deriveKind(cmd);
    if (kind === 'atomic') {
      const next: View = defaults !== undefined
        ? { kind: 'pickerChain', cmd, defaults }
        : { kind: 'pickerChain', cmd };
      setView(next);
      return;
    }
    // handoff
    if (formAdapter) {
      const next: View = defaults !== undefined
        ? { kind: 'form', cmd, defaults }
        : { kind: 'form', cmd };
      setView(next);
      return;
    }
    onParameterizedSelect?.(cmd);
  }

  if (view.kind === 'pickerChain') {
    const chainProps: Parameters<typeof PickerChain>[0] = view.defaults !== undefined
      ? {
          command: view.cmd,
          defaults: view.defaults,
          onSubmit: (params) => { void dispatchCommand(view.cmd, params); },
          onCancel: () => setView({ kind: 'list' }),
        }
      : {
          command: view.cmd,
          onSubmit: (params) => { void dispatchCommand(view.cmd, params); },
          onCancel: () => setView({ kind: 'list' }),
        };
    return (
      <div className={className} data-acture-palette-view="picker-chain">
        <PickerChain {...chainProps} />
      </div>
    );
  }

  if (view.kind === 'form' && formAdapter) {
    const FormAdapter = formAdapter;
    const formProps: PaletteFormAdapterProps = view.defaults !== undefined
      ? {
          command: view.cmd,
          defaults: view.defaults,
          onSubmit: (params) => { void dispatchCommand(view.cmd, params); },
          onCancel: () => setView({ kind: 'list' }),
        }
      : {
          command: view.cmd,
          onSubmit: (params) => { void dispatchCommand(view.cmd, params); },
          onCancel: () => setView({ kind: 'list' }),
        };
    return (
      <div className={className} data-acture-palette-view="form">
        <FormAdapter {...formProps} />
      </div>
    );
  }

  return (
    <Command className={className} label="Command palette" data-acture-palette-view="list">
      <Command.Input placeholder={placeholder} autoFocus />
      <Command.List>
        <Command.Empty>No matching commands.</Command.Empty>
        {groups.map(([category, items]) => (
          <Command.Group key={category} heading={category}>
            {items.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={paletteValue(cmd)}
                keywords={cmd.aliases ? [...cmd.aliases] : undefined}
                onSelect={() => selectFromList(cmd.id)}
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
  const kind = isParameterized ? deriveKind(cmd) : null;
  const keybinding = formatKeybinding(cmd.keybinding);
  return (
    <span
      data-acture-palette-item
      data-acture-parameterized={isParameterized ? '' : undefined}
      data-acture-kind={kind ?? undefined}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flex: 1 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {cmd.icon ? <span aria-hidden="true">{cmd.icon}</span> : null}
        <span>{cmd.title}</span>
        {isParameterized ? (
          <span
            data-acture-kind-badge
            style={{
              fontSize: '0.7em',
              opacity: 0.6,
              padding: '0 4px',
              border: '1px solid currentColor',
              borderRadius: 4,
            }}
          >
            {kind === 'atomic' ? '⇥' : '…'}
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
