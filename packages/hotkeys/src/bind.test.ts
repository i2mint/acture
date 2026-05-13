/// <reference lib="dom" />

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok } from 'acture';
import { bindHotkeys, collectBindings } from './bind.js';

function pressKey(target: Window | HTMLElement, key: string, modifiers: {
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
} = {}): void {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  (target as EventTarget).dispatchEvent(event);
}

describe('@acture/hotkeys', () => {
  beforeEach(() => {
    // jsdom defaults to 'Linux' navigator.platform — tinykeys treats
    // non-Mac as Ctrl for $mod, which is what we want for these tests.
  });

  describe('collectBindings', () => {
    it('produces one entry per (key, command) pair, preserving insertion order', () => {
      const registry = createRegistry();
      registry.register(
        defineCommand({
          id: 'a',
          title: 'A',
          keybinding: 'g',
          execute: () => ok(undefined),
        }),
      );
      registry.register(
        defineCommand({
          id: 'b',
          title: 'B',
          keybinding: 'g',
          when: 'editor.focused',
          execute: () => ok(undefined),
        }),
      );

      const table = collectBindings(registry);
      expect(table.size).toBe(1);
      const descriptors = table.get('g')!;
      expect(descriptors.map((d) => d.commandId)).toEqual(['a', 'b']);
    });

    it('skips commands without a keybinding', () => {
      const registry = createRegistry();
      registry.register(
        defineCommand({ id: 'noKb', title: 'No kb', execute: () => ok(undefined) }),
      );
      expect(collectBindings(registry).size).toBe(0);
    });

    it('expands a string-array keybinding into one entry per binding', () => {
      const registry = createRegistry();
      registry.register(
        defineCommand({
          id: 'multi',
          title: 'Multi',
          keybinding: ['$mod+k', '$mod+p'],
          execute: () => ok(undefined),
        }),
      );
      const table = collectBindings(registry);
      expect(table.has('$mod+k')).toBe(true);
      expect(table.has('$mod+p')).toBe(true);
    });
  });

  describe('bindHotkeys — dispatch behavior', () => {
    it('dispatches the command on key match', async () => {
      const registry = createRegistry();
      const execute = vi.fn(() => ok({ done: true }));
      registry.register(
        defineCommand({
          id: 'app.toggle',
          title: 'Toggle',
          keybinding: 'g',
          execute,
        }),
      );

      const stop = bindHotkeys(registry, { target: window });
      pressKey(window, 'g');
      await new Promise((r) => setTimeout(r, 0));
      expect(execute).toHaveBeenCalledTimes(1);
      stop();
    });

    it('first-registered-wins under matching context', async () => {
      const registry = createRegistry();
      const execFirst = vi.fn(() => ok('first'));
      const execSecond = vi.fn(() => ok('second'));
      // First wins by registration order when its when-clause passes.
      registry.register(
        defineCommand({
          id: 'first',
          title: 'First',
          keybinding: 'g',
          when: 'mode == "edit"',
          execute: execFirst,
        }),
      );
      registry.register(
        defineCommand({
          id: 'second',
          title: 'Second',
          keybinding: 'g',
          when: 'mode == "view"',
          execute: execSecond,
        }),
      );

      let mode = 'edit';
      const stop = bindHotkeys(registry, {
        target: window,
        contextProvider: () => ({ mode }),
      });
      pressKey(window, 'g');
      await new Promise((r) => setTimeout(r, 0));
      expect(execFirst).toHaveBeenCalledTimes(1);
      expect(execSecond).not.toHaveBeenCalled();

      mode = 'view';
      pressKey(window, 'g');
      await new Promise((r) => setTimeout(r, 0));
      expect(execSecond).toHaveBeenCalledTimes(1);
      stop();
    });

    it('ignores hotkeys while typing in an input by default', async () => {
      const registry = createRegistry();
      const execute = vi.fn(() => ok(undefined));
      registry.register(
        defineCommand({
          id: 'cmd',
          title: 'C',
          keybinding: 'g',
          execute,
        }),
      );
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      const stop = bindHotkeys(registry, { target: window });
      pressKey(input, 'g');
      await new Promise((r) => setTimeout(r, 0));
      expect(execute).not.toHaveBeenCalled();
      stop();
      input.remove();
    });

    it('rebinds on commandsChanged when a new keybinding is registered', async () => {
      const registry = createRegistry();
      const stop = bindHotkeys(registry, { target: window });
      const execute = vi.fn(() => ok(undefined));
      // Register AFTER bindHotkeys — the rebind path is exercised.
      registry.register(
        defineCommand({
          id: 'late',
          title: 'L',
          keybinding: 'h',
          execute,
        }),
      );
      pressKey(window, 'h');
      await new Promise((r) => setTimeout(r, 0));
      expect(execute).toHaveBeenCalledTimes(1);
      stop();
    });

    it('does not dispatch parameterized commands (no params from a hotkey)', async () => {
      // The dispatcher will reject because Zod validation fails on
      // undefined input; the test asserts the result shape is err.
      const registry = createRegistry();
      registry.register(
        defineCommand({
          id: 'app.set',
          title: 'Set',
          keybinding: 'p',
          params: z.object({ value: z.string() }),
          execute: (p) => ok(p),
        }),
      );
      const onDispatched = vi.fn();
      const stop = bindHotkeys(registry, { target: window, onDispatched });
      pressKey(window, 'p');
      await new Promise((r) => setTimeout(r, 0));
      expect(onDispatched).toHaveBeenCalledTimes(1);
      const [, result] = onDispatched.mock.calls[0]!;
      expect(result.ok).toBe(false);
      stop();
    });

    it('stop() unbinds everything', async () => {
      const registry = createRegistry();
      const execute = vi.fn(() => ok(undefined));
      registry.register(
        defineCommand({ id: 'x', title: 'X', keybinding: 'g', execute }),
      );
      const stop = bindHotkeys(registry, { target: window });
      stop();
      pressKey(window, 'g');
      await new Promise((r) => setTimeout(r, 0));
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
