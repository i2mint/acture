/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { createRegistry, defineCommand, ok } from 'acture';
import { CommandPalette } from './palette.js';
import type { PaletteFormAdapter } from './palette.js';

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
      execute: (p) => ok(p),
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
    expect(screen.queryByText('Experimental thing')).toBeNull();
  });

  it('shows the keybinding hint on items that have one', () => {
    const { registry } = setup();
    render(<CommandPalette registry={registry} />);
    expect(screen.getByText('$mod+0')).toBeTruthy();
    expect(screen.getByText('$mod+a')).toBeTruthy();
  });

  it('renders parameterized commands with a kind badge', () => {
    const { registry } = setup();
    const { container } = render(<CommandPalette registry={registry} />);
    // addNode has 1 z.string() param → handoff
    const items = container.querySelectorAll('[data-acture-kind]');
    const handoff = Array.from(items).find((el) => el.getAttribute('data-acture-kind') === 'handoff');
    expect(handoff).toBeTruthy();
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

  it('routes handoff commands to onParameterizedSelect when no form adapter is supplied', async () => {
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

  it('renders host-supplied formAdapter inline for handoff commands', async () => {
    const { registry } = setup();
    const onDispatched = vi.fn();
    const FormAdapter: PaletteFormAdapter = ({ command, onSubmit }) => (
      <div data-testid="form-adapter">
        <span>Form for {command.title}</span>
        <button onClick={() => onSubmit({ label: 'Z' })}>submit</button>
      </div>
    );
    render(
      <CommandPalette registry={registry} onDispatched={onDispatched} formAdapter={FormAdapter} />,
    );
    const item = screen.getByText('Add node').closest('[cmdk-item]')!;
    await act(async () => {
      fireEvent.click(item);
    });
    // Palette switched to form view.
    expect(screen.getByTestId('form-adapter')).toBeTruthy();
    // Submit dispatches.
    await act(async () => {
      fireEvent.click(screen.getByText('submit'));
    });
    expect(onDispatched).toHaveBeenCalledOnce();
    const [, result] = onDispatched.mock.calls[0]!;
    expect((result as { ok: boolean; value: { label: string } }).value.label).toBe('Z');
  });

  it('renders an inline picker chain for atomic parameterized commands', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.style.set',
        title: 'Set style',
        category: 'Style',
        params: z.object({ variant: z.enum(['solid', 'dashed', 'dotted']) }),
        execute: (p) => ok(p),
      }),
    );
    const onDispatched = vi.fn();
    const { container } = render(
      <CommandPalette registry={registry} onDispatched={onDispatched} />,
    );
    const item = screen.getByText('Set style').closest('[cmdk-item]')!;
    await act(async () => {
      fireEvent.click(item);
    });
    expect(container.querySelector('[data-acture-picker-chain]')).toBeTruthy();
    // Pick an option.
    const option = screen.getByText('dashed').closest('[cmdk-item]')!;
    await act(async () => {
      fireEvent.click(option);
    });
    expect(onDispatched).toHaveBeenCalledOnce();
    const [, result] = onDispatched.mock.calls[0]!;
    expect((result as { value: { variant: string } }).value.variant).toBe('dashed');
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
