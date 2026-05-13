import { describe, it, expect } from 'vitest';
import { compileWhen, evaluateWhen, isFunctionWhen } from './when.js';

describe('when-clause DSL — parsing', () => {
  it('parses simple identifier', () => {
    expect(compileWhen('editor.focused').evaluate({ editor: { focused: true } })).toBe(true);
    expect(compileWhen('editor.focused').evaluate({ editor: { focused: false } })).toBe(false);
  });

  it('parses negation', () => {
    expect(compileWhen('!editor.focused').evaluate({ editor: { focused: false } })).toBe(true);
    expect(compileWhen('!editor.focused').evaluate({ editor: { focused: true } })).toBe(false);
  });

  it('parses && with correct precedence', () => {
    const e = compileWhen('a && b');
    expect(e.evaluate({ a: true, b: true })).toBe(true);
    expect(e.evaluate({ a: true, b: false })).toBe(false);
    expect(e.evaluate({ a: false, b: true })).toBe(false);
  });

  it('parses || with correct precedence', () => {
    const e = compileWhen('a || b');
    expect(e.evaluate({ a: true, b: false })).toBe(true);
    expect(e.evaluate({ a: false, b: false })).toBe(false);
    expect(e.evaluate({ a: false, b: true })).toBe(true);
  });

  it('&& binds tighter than ||', () => {
    // a || b && c  ≡  a || (b && c)
    const e = compileWhen('a || b && c');
    expect(e.evaluate({ a: false, b: true, c: false })).toBe(false);
    expect(e.evaluate({ a: false, b: true, c: true })).toBe(true);
    expect(e.evaluate({ a: true, b: false, c: false })).toBe(true);
  });

  it('parses parenthesized groupings', () => {
    const e = compileWhen('(a || b) && c');
    expect(e.evaluate({ a: true, b: false, c: false })).toBe(false);
    expect(e.evaluate({ a: true, b: false, c: true })).toBe(true);
    expect(e.evaluate({ a: false, b: true, c: true })).toBe(true);
  });

  it('parses == and !=', () => {
    expect(compileWhen('mode == "edit"').evaluate({ mode: 'edit' })).toBe(true);
    expect(compileWhen('mode == "edit"').evaluate({ mode: 'view' })).toBe(false);
    expect(compileWhen('count != 0').evaluate({ count: 3 })).toBe(true);
    expect(compileWhen('count != 0').evaluate({ count: 0 })).toBe(false);
  });

  it('parses >= and <=', () => {
    expect(compileWhen('selection.length >= 2').evaluate({ selection: { length: 3 } })).toBe(true);
    expect(compileWhen('selection.length >= 2').evaluate({ selection: { length: 1 } })).toBe(false);
    expect(compileWhen('selection.length <= 2').evaluate({ selection: { length: 2 } })).toBe(true);
  });

  it('parses =~ regex match (regex literal)', () => {
    expect(compileWhen('path =~ /^src\\//').evaluate({ path: 'src/foo.ts' })).toBe(true);
    expect(compileWhen('path =~ /^src\\//').evaluate({ path: 'docs/foo.md' })).toBe(false);
  });

  it('parses =~ regex match (string RHS)', () => {
    expect(compileWhen('path =~ "\\.ts$"').evaluate({ path: 'foo.ts' })).toBe(true);
    expect(compileWhen('path =~ "\\.ts$"').evaluate({ path: 'foo.md' })).toBe(false);
  });

  it('parses in / not in', () => {
    expect(compileWhen('lang in langs').evaluate({ lang: 'ts', langs: ['ts', 'js'] })).toBe(true);
    expect(compileWhen('lang in langs').evaluate({ lang: 'py', langs: ['ts', 'js'] })).toBe(false);
    expect(compileWhen('lang not in langs').evaluate({ lang: 'py', langs: ['ts', 'js'] })).toBe(true);
  });

  it('rejects bare > and <', () => {
    expect(() => compileWhen('count > 0')).toThrow(/'>'/);
    expect(() => compileWhen('count < 0')).toThrow(/'<'/);
  });

  it('rejects bare "not" without "in"', () => {
    expect(() => compileWhen('not editor.focused')).toThrow(/not/);
  });

  it('rejects unterminated string', () => {
    expect(() => compileWhen('mode == "edit')).toThrow(/string/);
  });

  it('rejects unbalanced paren', () => {
    expect(() => compileWhen('(a && b')).toThrow(/'\)'/);
  });
});

describe('evaluateWhen wrapper', () => {
  it('treats undefined as always-true', () => {
    expect(evaluateWhen(undefined, {})).toBe(true);
  });

  it('invokes function escape hatch', () => {
    const fn = (ctx: Record<string, unknown>) => ctx['x'] === 7;
    expect(evaluateWhen(fn, { x: 7 })).toBe(true);
    expect(evaluateWhen(fn, { x: 8 })).toBe(false);
  });

  it('parses + evaluates DSL string', () => {
    expect(evaluateWhen('a && b', { a: 1, b: 1 })).toBe(true);
  });
});

describe('isFunctionWhen', () => {
  it('detects function form', () => {
    expect(isFunctionWhen(() => true)).toBe(true);
    expect(isFunctionWhen('a && b')).toBe(false);
    expect(isFunctionWhen(undefined)).toBe(false);
  });
});
