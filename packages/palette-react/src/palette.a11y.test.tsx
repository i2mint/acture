/// <reference lib="dom" />
/**
 * Accessibility contract of `<CommandPalette />` (research-12 §3 item 5, #64).
 *
 * The palette inherits the WAI-ARIA APG combobox pattern from cmdk. These
 * tests pin that inheritance down — roles, the accessible name, the
 * `aria-activedescendant` roving highlight — and the focus hand-off when the
 * view switches (list → picker chain / form → back to the list), so a cmdk
 * upgrade or an acture refactor cannot silently drop it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { createRegistry, defineCommand, ok } from 'acture';
import { CommandPalette } from './palette.js';
import type { PaletteFormAdapter } from './palette.js';

afterEach(() => cleanup());

function setup() {
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({
      id: 'app.view.zoomToFit',
      title: 'Zoom to fit',
      category: 'View',
      execute: () => ok('zoomed'),
    }),
    defineCommand({
      id: 'app.selection.selectAll',
      title: 'Select all',
      category: 'Selection',
      execute: () => ok('selected'),
    }),
    defineCommand({
      id: 'app.style.set',
      title: 'Set style',
      category: 'Style',
      params: z.object({ variant: z.enum(['solid', 'dashed']) }),
      execute: (p) => ok(p),
    }),
    defineCommand({
      id: 'app.graph.addNode',
      title: 'Add node',
      category: 'Graph',
      params: z.object({ label: z.string(), size: z.number() }),
      execute: (p) => ok(p),
    }),
  ]);
  return registry;
}

describe('<CommandPalette /> accessibility', () => {
  it('exposes the APG combobox pattern: combobox input controlling a listbox of options', () => {
    render(<CommandPalette registry={setup()} />);
    const input = screen.getByRole('combobox');
    const listbox = screen.getByRole('listbox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('gives the palette, the listbox and the input an accessible name', () => {
    const { container } = render(<CommandPalette registry={setup()} />);
    const root = container.querySelector('[cmdk-root]')!;
    expect(root.getAttribute('data-acture-palette-view')).toBe('list');
    // `label` on <Command> is rendered as a visually-hidden <label> naming the input.
    const input = screen.getByRole('combobox');
    const labelId = input.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe('Command palette');
    expect(screen.getByRole('listbox').getAttribute('aria-label')).toBeTruthy();
  });

  it('groups options under named groups', () => {
    render(<CommandPalette registry={setup()} />);
    const groups = screen.getAllByRole('group');
    const names = groups.map((g) => g.getAttribute('aria-labelledby'))
      .map((id) => (id ? document.getElementById(id)?.textContent : null));
    expect(names).toEqual(expect.arrayContaining(['View', 'Selection', 'Style', 'Graph']));
  });

  it('keeps DOM focus in the input and moves aria-activedescendant with the arrow keys', async () => {
    render(<CommandPalette registry={setup()} />);
    // cmdk publishes the highlighted option id one scheduled flush after mount.
    await act(async () => {});
    const input = screen.getByRole('combobox');
    expect(document.activeElement).toBe(input);

    const selectedOptionId = (): string | null =>
      screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.id ?? null;

    // Exactly one option is highlighted from the start.
    const first = selectedOptionId();
    expect(first).toBeTruthy();
    // Known cmdk 1.1.1 quirk: `aria-activedescendant` is only published once the
    // highlight MOVES, so the very first option is not announced until the user
    // presses an arrow key. Asserted loosely here; tightened if cmdk fixes it.
    const initial = input.getAttribute('aria-activedescendant');
    expect([null, first]).toContain(initial);

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    const second = selectedOptionId();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(input.getAttribute('aria-activedescendant')).toBe(second);
    expect(document.activeElement).toBe(input);
  });

  it('marks the decorative icon aria-hidden and keeps the title as the option name', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.x.save',
        title: 'Save file',
        icon: '💾',
        keybinding: '$mod+s',
        execute: () => ok(0),
      }),
    );
    render(<CommandPalette registry={registry} />);
    const option = screen.getByRole('option');
    expect(option.querySelector('[aria-hidden="true"]')?.textContent).toBe('💾');
    // WCAG 2.5.3 Label in Name: the visible title is part of the option's text.
    expect(option.textContent).toContain('Save file');
  });

  it('hands focus to the picker-chain input when an atomic parameterized command is chosen', async () => {
    render(<CommandPalette registry={setup()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Set style').closest('[cmdk-item]')!);
    });
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('placeholder')).toBe('Pick variant…');
    expect(document.activeElement).toBe(input);
    // The step's own combobox is named for the parameter being collected.
    const labelId = input.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId!)?.textContent).toBe('Pick variant');
  });

  it('focuses the text step input of a picker chain and names it', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.graph.rename',
        title: 'Rename node',
        params: z.object({ label: z.string() }),
        kind: 'atomic',
        execute: (p) => ok(p),
      }),
    );
    const { container } = render(<CommandPalette registry={registry} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Rename node').closest('[cmdk-item]')!);
    });
    const text = container.querySelector<HTMLInputElement>('[data-acture-text-step]')!;
    expect(document.activeElement).toBe(text);
    expect(screen.getByRole('textbox', { name: 'label' })).toBe(text);
  });

  it('announces a validation error on the text step', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.graph.resize',
        title: 'Resize',
        params: z.object({ size: z.number().min(1) }),
        kind: 'atomic',
        execute: (p) => ok(p),
      }),
    );
    const { container } = render(<CommandPalette registry={registry} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Resize').closest('[cmdk-item]')!);
    });
    const text = container.querySelector<HTMLInputElement>('[data-acture-text-step]')!;
    await act(async () => {
      fireEvent.change(text, { target: { value: '0' } });
      fireEvent.keyDown(text, { key: 'Enter' });
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(text.getAttribute('aria-invalid')).toBe('true');
    expect(text.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('returns focus to the palette input when the picker chain is cancelled with Escape', async () => {
    render(<CommandPalette registry={setup()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Set style').closest('[cmdk-item]')!);
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    });
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('placeholder')).toBe('Type a command…');
    expect(document.activeElement).toBe(input);
  });

  it('mounts the form adapter in place of the list, then restores the list and its focus on cancel', async () => {
    const FormAdapter: PaletteFormAdapter = ({ command, onCancel }) => (
      <form aria-label={command.title}>
        <input aria-label="Label" autoFocus />
        <button type="button" onClick={onCancel}>cancel</button>
      </form>
    );
    const { container } = render(<CommandPalette registry={setup()} formAdapter={FormAdapter} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Add node').closest('[cmdk-item]')!);
    });
    // The list (and its combobox) is gone; the host form owns focus.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(container.querySelector('[data-acture-palette-view="form"]')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Label' }));

    await act(async () => {
      fireEvent.click(screen.getByText('cancel'));
    });
    const input = screen.getByRole('combobox');
    expect(document.activeElement).toBe(input);
  });
});
