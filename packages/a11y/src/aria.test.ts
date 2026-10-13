import { describe, it, expect } from 'vitest';
import { defineCommand, ok } from 'acture';
import { toAriaProps, toAriaKeyShortcuts, isAvailable } from './aria.js';

const cmd = (spec: Partial<Parameters<typeof defineCommand>[0]> = {}) =>
  defineCommand({ id: 'app.t.x', title: 'Do it', execute: () => ok(0), ...spec });

describe('toAriaKeyShortcuts', () => {
  it('resolves $mod to Control or Meta per platform', () => {
    expect(toAriaKeyShortcuts(['$mod+Shift+p'], { apple: false })).toBe('Control+Shift+P');
    expect(toAriaKeyShortcuts(['$mod+Shift+p'], { apple: true })).toBe('Meta+Shift+P');
  });

  it('uses UI Events key names', () => {
    expect(toAriaKeyShortcuts(['Esc'], { apple: false })).toBe('Escape');
    expect(toAriaKeyShortcuts(['Ctrl+Alt+ArrowUp', 'cmd+option+k'], { apple: false })).toBe(
      'Control+Alt+ArrowUp Meta+Alt+K',
    );
  });

  it('keeps a literal + key and uppercases single letters', () => {
    expect(toAriaKeyShortcuts(['$mod++'], { apple: false })).toBe('Control+Plus');
    expect(toAriaKeyShortcuts(['alt+a'], { apple: false })).toBe('Alt+A');
  });

  it('drops chords (ARIA cannot express key sequences) and de-duplicates', () => {
    expect(toAriaKeyShortcuts(['g i'], { apple: false })).toBeUndefined();
    expect(toAriaKeyShortcuts(['g i', '$mod+k', 'Ctrl+k'], { apple: false })).toBe('Control+K');
  });

  it('maps event.code tokens to key names', () => {
    expect(toAriaKeyShortcuts(['$mod+KeyP', 'Alt+Digit1'], { apple: false })).toBe('Control+P Alt+1');
  });

  it('returns undefined for nothing', () => {
    expect(toAriaKeyShortcuts([])).toBeUndefined();
  });
});

describe('toAriaProps', () => {
  it('projects label, description and shortcut', () => {
    const props = toAriaProps(
      cmd({ title: 'Save', description: 'Save the file', keybinding: '$mod+s' }),
      { apple: false },
    );
    expect(props).toEqual({
      'aria-label': 'Save',
      'aria-description': 'Save the file',
      'aria-keyshortcuts': 'Control+S',
    });
  });

  it('omits absent attributes instead of writing undefined', () => {
    expect(toAriaProps(cmd())).toEqual({ 'aria-label': 'Do it' });
  });

  it('maps a false when to aria-disabled and drops the shortcut', () => {
    const c = cmd({ when: 'editor.focused', keybinding: '$mod+s' });
    expect(toAriaProps(c, { ctx: { editor: { focused: false } }, apple: false })).toEqual({
      'aria-label': 'Do it',
      'aria-disabled': 'true',
    });
    expect(toAriaProps(c, { ctx: { editor: { focused: true } }, apple: false })).toEqual({
      'aria-label': 'Do it',
      'aria-keyshortcuts': 'Control+S',
    });
  });

  it('does not evaluate when without a context', () => {
    expect(isAvailable(cmd({ when: 'editor.focused' }))).toBe(true);
    expect(toAriaProps(cmd({ when: 'editor.focused' }))['aria-disabled']).toBeUndefined();
  });

  it('supports function when-clauses', () => {
    const c = cmd({ when: (ctx) => ctx['on'] === true });
    expect(isAvailable(c, { on: false })).toBe(false);
    expect(isAvailable(c, { on: true })).toBe(true);
  });

  it('uses the live keys passed in, not the record default', () => {
    const c = cmd({ keybinding: '$mod+s' });
    expect(toAriaProps(c, { keys: ['$mod+Shift+s'], apple: true })['aria-keyshortcuts']).toBe(
      'Meta+Shift+S',
    );
    expect(toAriaProps(c, { keys: [] })['aria-keyshortcuts']).toBeUndefined();
  });
});
