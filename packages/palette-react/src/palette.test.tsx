/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { createRegistry, defineCommand, ok } from 'acture';
import { CommandPalette } from './palette.js';

afterEach(() => cleanup());

function setup() {
  const registry = createRegistry();
  const dispose = registry.registerAll([
    defineCommand({
      id: 'app.view.zoomToFit',
      title: 'Zoom to fit',
      category: 'View',
      keybinding: '$mod+0',
      execute: () => ok('zoomed'),
    }),
    defineCommand({
      id: 'app.selection.selectAll',
      title: 'Select all',
      category: 'Selection',
      keybinding: '$mod+a',
      execute: () => ok('selected'),
    }),
    defineCommand({
      id: 'app.graph.addNode',
      title: 'Add node',
      category: 'Graph',
      params: z.object({ label: z.string() }),
      execute: () => ok('added'),
    }),
    defineCommand({
      id: 'app.x.exp',
      title: 'Experimental thing',
      tier: 'experimental',
      execute: () => ok('exp'),
    }),
  ]);
  return { registry, dispose };
}

describe('<CommandPalette />', () => {
  it('lists stable commands grouped by category', () => {
    const { registry } = setup();
    render(<CommandPalette registry={registry} />);
    expect(screen.getByText('Zoom to fit')).toBeTruthy();
    expect(screen.getByText('Select all')).toBeTruthy();
    expect(screen.getByText('Add node')).toBeTruthy();
    // experimental is filtered out at default tier
    expect(screen.queryByText('Experimental thing')).toBeNull();
  });

  it('shows the keybinding hint on items that have one', () => {
    const { registry } = setup();
    render(<CommandPalette registry={registry} />);
    expect(screen.getByText('$mod+0')).toBeTruthy();
    expect(screen.getByText('$mod+a')).toBeTruthy();
  });

  it('marks parameterized commands with a Phase 2 badge', () => {
    const { registry } = setup();
    const { container } = render(<CommandPalette registry={registry} />);
    expect(container.querySelector('[data-acture-phase2-badge]')).toBeTruthy();
  });

  it('dispatches parameter-free commands on select', async () => {
    const { registry } = setup();
    const onDispatched = vi.fn();
    render(<CommandPalette registry={registry} onDispatched={onDispatched} />);
    const item = screen.getByText('Zoom to fit').closest('[cmdk-item]')!;
    await act(async () => {
      fireEvent.click(item);
    });
    expect(onDispatched).toHaveBeenCalledOnce();
    const [cmd, result] = onDispatched.mock.calls[0]!;
    expect((cmd as { id: string }).id).toBe('app.view.zoomToFit');
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it('routes parameterized commands to onParameterizedSelect (not dispatch)', async () => {
    const { registry } = setup();
    const onParameterized = vi.fn();
    const onDispatched = vi.fn();
    render(
      <CommandPalette
        registry={registry}
        onParameterizedSelect={onParameterized}
        onDispatched={onDispatched}
      />,
    );
    const item = screen.getByText('Add node').closest('[cmdk-item]')!;
    await act(async () => {
      fireEvent.click(item);
    });
    expect(onParameterized).toHaveBeenCalledOnce();
    expect(onDispatched).not.toHaveBeenCalled();
  });

  it('re-renders when commandsChanged fires', async () => {
    const { registry } = setup();
    render(<CommandPalette registry={registry} />);
    expect(screen.queryByText('Newly added')).toBeNull();
    await act(async () => {
      registry.register(
        defineCommand({
          id: 'app.late.add',
          title: 'Newly added',
          category: 'Late',
          execute: () => ok(0),
        }),
      );
    });
    expect(screen.getByText('Newly added')).toBeTruthy();
  });

  it('respects when-clause context filtering', () => {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({
        id: 'app.t.gated',
        title: 'Gated command',
        when: 'editor.focused',
        execute: () => ok(0),
      }),
    ]);
    const { rerender } = render(
      <CommandPalette registry={registry} context={{ editor: { focused: false } }} />,
    );
    expect(screen.queryByText('Gated command')).toBeNull();
    rerender(
      <CommandPalette registry={registry} context={{ editor: { focused: true } }} />,
    );
    expect(screen.getByText('Gated command')).toBeTruthy();
  });

  it('honors explicit tiers prop', () => {
    const { registry } = setup();
    render(<CommandPalette registry={registry} tiers={['stable', 'experimental']} />);
    expect(screen.getByText('Experimental thing')).toBeTruthy();
  });
});
