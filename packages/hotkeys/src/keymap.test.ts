/// <reference lib="dom" />

import { describe, it, expect } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import { collectBindings } from './bind.js';
import {
  resolveKeys,
  detectConflicts,
  tokenFromEvent,
  isReservedCombo,
  formatKeybinding,
  EMPTY_KEYMAP,
  type UserKeymap,
} from './keymap.js';

const cmd = (id: string, keybinding?: string | string[]) => ({ id, keybinding });

describe('resolveKeys', () => {
  it('returns the record default when no override exists', () => {
    expect(resolveKeys(cmd('a', 'g'), EMPTY_KEYMAP)).toEqual(['g']);
    expect(resolveKeys(cmd('a', ['g', 'h']), EMPTY_KEYMAP)).toEqual(['g', 'h']);
    expect(resolveKeys(cmd('a'), EMPTY_KEYMAP)).toEqual([]);
  });

  it('replace / add / remove override the default', () => {
    const km = (o: UserKeymap['overrides']): UserKeymap => ({ version: 1, overrides: o });
    expect(resolveKeys(cmd('a', 'g'), km({ a: { kind: 'replace', keys: ['$mod+k'] } }))).toEqual([
      '$mod+k',
    ]);
    expect(resolveKeys(cmd('a', 'g'), km({ a: { kind: 'add', keys: ['x'] } }))).toEqual(['g', 'x']);
    expect(resolveKeys(cmd('a', 'g'), km({ a: { kind: 'remove' } }))).toEqual([]);
  });

  it('de-duplicates keys (an add/replace that restates an existing binding)', () => {
    const km = (o: UserKeymap['overrides']): UserKeymap => ({ version: 1, overrides: o });
    // 'add' re-adding the record default must not bind the key twice.
    expect(resolveKeys(cmd('a', 'g'), km({ a: { kind: 'add', keys: ['g'] } }))).toEqual(['g']);
    expect(resolveKeys(cmd('a', 'g'), km({ a: { kind: 'add', keys: ['g', 'x', 'x'] } }))).toEqual([
      'g',
      'x',
    ]);
    expect(resolveKeys(cmd('a', 'g'), km({ a: { kind: 'replace', keys: ['x', 'x'] } }))).toEqual([
      'x',
    ]);
  });
});

describe('collectBindings with a keymap', () => {
  it('applies the override and sorts user-touched bindings first on a shared key', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'default', title: 'D', keybinding: 'g', execute: () => ok(undefined) }));
    registry.register(defineCommand({ id: 'user', title: 'U', keybinding: 'x', execute: () => ok(undefined) }));
    // user remaps 'user' onto 'g', which 'default' already owns
    const keymap: UserKeymap = { version: 1, overrides: { user: { kind: 'replace', keys: ['g'] } } };

    const table = collectBindings(registry, undefined, keymap);
    const onG = table.get('g')!.map((d) => d.commandId);
    expect(onG).toEqual(['user', 'default']); // user-touched wins the key
    expect(table.get('x')).toBeUndefined(); // 'x' was replaced away
  });

  it('is a no-op without a keymap (unchanged default behaviour)', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'a', title: 'A', keybinding: 'g', execute: () => ok(undefined) }));
    registry.register(defineCommand({ id: 'b', title: 'B', keybinding: 'g', execute: () => ok(undefined) }));
    expect(collectBindings(registry).get('g')!.map((d) => d.commandId)).toEqual(['a', 'b']);
  });
});

describe('detectConflicts', () => {
  it('reports a definite conflict when two unscoped commands share a key', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'a', title: 'A', keybinding: 'g', execute: () => ok(undefined) }));
    registry.register(defineCommand({ id: 'b', title: 'B', keybinding: 'g', execute: () => ok(undefined) }));
    const conflicts = detectConflicts(registry);
    expect(conflicts).toEqual([
      { keySequence: 'g', commandIds: ['a', 'b'], severity: 'definite' },
    ]);
  });

  it('downgrades to "possible" when a sharer is when-scoped', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'a', title: 'A', keybinding: 'g', execute: () => ok(undefined) }));
    registry.register(defineCommand({ id: 'b', title: 'B', keybinding: 'g', when: 'editor.focused', execute: () => ok(undefined) }));
    expect(detectConflicts(registry)[0]!.severity).toBe('possible');
  });

  it('reports nothing when keys are distinct', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'a', title: 'A', keybinding: 'g', execute: () => ok(undefined) }));
    registry.register(defineCommand({ id: 'b', title: 'B', keybinding: 'x', execute: () => ok(undefined) }));
    expect(detectConflicts(registry)).toEqual([]);
  });

  it('surfaces a conflict introduced by a user override', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'a', title: 'A', keybinding: 'g', execute: () => ok(undefined) }));
    registry.register(defineCommand({ id: 'b', title: 'B', keybinding: 'x', execute: () => ok(undefined) }));
    const keymap: UserKeymap = { version: 1, overrides: { b: { kind: 'replace', keys: ['g'] } } };
    const conflicts = detectConflicts(registry, keymap);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.commandIds.sort()).toEqual(['a', 'b']);
  });

  it('does not report a command as conflicting with itself (add restates its default)', () => {
    const registry = createRegistry();
    registry.register(defineCommand({ id: 'a', title: 'A', keybinding: 'g', execute: () => ok(undefined) }));
    // A preset / remap UI that re-adds the key the command already has must
    // NOT surface a bogus "'a' conflicts with 'a'" entry.
    const keymap: UserKeymap = { version: 1, overrides: { a: { kind: 'add', keys: ['g'] } } };
    expect(detectConflicts(registry, keymap)).toEqual([]);
  });
});

describe('tokenFromEvent', () => {
  const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it('builds a $mod token from a modified keypress', () => {
    expect(tokenFromEvent(ev({ key: 'k', ctrlKey: true }))).toBe('$mod+k');
    expect(tokenFromEvent(ev({ key: 'K', ctrlKey: true, shiftKey: true }))).toBe('$mod+Shift+k');
    expect(tokenFromEvent(ev({ key: 'k', metaKey: true }))).toBe('$mod+k');
  });

  it('returns null for a lone modifier press', () => {
    expect(tokenFromEvent(ev({ key: 'Control' }))).toBeNull();
    expect(tokenFromEvent(ev({ key: 'Shift' }))).toBeNull();
  });

  it('emits event.code tokens in positional mode', () => {
    expect(tokenFromEvent(ev({ key: 'w', code: 'KeyW', ctrlKey: true }), { mode: 'code' })).toBe(
      '$mod+KeyW',
    );
  });

  it('emits a matchable "Space" token for the spacebar (not an empty key)', () => {
    // event.key for the spacebar is a literal ' '; a ' ' token is stripped by
    // tinykeys' space-separated chord parser and never fires. 'Space' matches
    // via event.code.
    expect(tokenFromEvent(ev({ key: ' ' }))).toBe('Space');
    expect(tokenFromEvent(ev({ key: ' ', ctrlKey: true }))).toBe('$mod+Space');
    expect(tokenFromEvent(ev({ key: ' ', shiftKey: true }))).toBe('Shift+Space');
  });
});

describe('isReservedCombo', () => {
  it('flags browser/OS-reserved combos, order-independent', () => {
    expect(isReservedCombo('$mod+w')).toBe(true);
    expect(isReservedCombo('$mod+t')).toBe(true);
    expect(isReservedCombo('$mod+Shift+w')).toBe(true);
    expect(isReservedCombo('Shift+$mod+w')).toBe(true); // order-independent
    expect(isReservedCombo('$mod+k')).toBe(false);
    expect(isReservedCombo('g')).toBe(false);
  });
});

describe('formatKeybinding', () => {
  it('resolves $mod and symbols per platform', () => {
    expect(formatKeybinding('$mod+k', { apple: false })).toBe('Ctrl+K');
    expect(formatKeybinding('$mod+k', { apple: true })).toBe('⌘K');
    expect(formatKeybinding('$mod+Shift+k', { apple: true })).toBe('⌘⇧K');
  });

  it('formats each combo of a chord', () => {
    expect(formatKeybinding('g i', { apple: false })).toBe('G I');
  });
});
