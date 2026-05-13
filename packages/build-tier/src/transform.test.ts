/**
 * Transform tests. The transform is the load-bearing piece — the plugin
 * wrappers are thin. Make sure each of the four tags is recognized,
 * idempotency works, and idle files pass through untouched.
 */

import { describe, it, expect } from 'vitest';
import { parseTierDirective, transformSource } from './transform.js';

describe('parseTierDirective', () => {
  it('parses @stable', () => {
    expect(parseTierDirective('* Foo.\n * @stable')).toEqual({ tier: 'stable' });
  });

  it('parses @experimental', () => {
    expect(parseTierDirective('@experimental')).toEqual({ tier: 'experimental' });
  });

  it('parses @internal', () => {
    expect(parseTierDirective('@internal')).toEqual({ tier: 'internal' });
  });

  it('parses @deprecated with reason', () => {
    const out = parseTierDirective('@deprecated use app.new.thing instead');
    expect(out).toEqual({ tier: 'deprecated', reason: 'use app.new.thing instead' });
  });

  it('parses bare @deprecated (no reason)', () => {
    const out = parseTierDirective('Some doc.\n@deprecated');
    expect(out).toEqual({ tier: 'deprecated' });
  });

  it('honours precedence: internal > deprecated > experimental > stable', () => {
    expect(parseTierDirective('@stable @experimental')).toEqual({ tier: 'experimental' });
    expect(parseTierDirective('@experimental @deprecated soon')).toEqual({
      tier: 'deprecated',
      reason: 'soon',
    });
    expect(parseTierDirective('@deprecated @internal')).toEqual({ tier: 'internal' });
  });

  it('returns undefined when no tag is present', () => {
    expect(parseTierDirective('Just docs, no tier.')).toBeUndefined();
  });
});

describe('transformSource', () => {
  it('injects tier: stable into a stable-tagged defineCommand', () => {
    const src = `
/**
 * Search.
 * @stable
 */
export const search = defineCommand({
  id: 'app.search',
  title: 'Search',
  execute: () => ({ ok: true, value: null }),
});
`;
    const { code, applied } = transformSource(src);
    expect(code).toContain("tier: \"stable\"");
    expect(applied).toEqual([{ tier: 'stable' }]);
  });

  it('injects tier: experimental into an experimental-tagged call', () => {
    const src = `
/** @experimental */
defineCommand({ id: 'app.x', title: 'X', execute: () => null });
`;
    const { code } = transformSource(src);
    expect(code).toContain('tier: "experimental"');
  });

  it('injects deprecationReason for @deprecated with reason', () => {
    const src = `
/** @deprecated use app.new.thing instead */
defineCommand({ id: 'app.old', title: 'Old', execute: () => null });
`;
    const { code } = transformSource(src);
    expect(code).toContain('tier: "deprecated"');
    expect(code).toContain('deprecationReason: "use app.new.thing instead"');
  });

  it('injects internalToken and module-scope Symbol for @internal', () => {
    const src = `
/** @internal */
defineCommand({ id: 'app.i', title: 'I', execute: () => null });
`;
    const { code } = transformSource(src);
    expect(code).toContain("Symbol('acture.internal')");
    expect(code).toContain('__actureInternalToken__');
    expect(code).toContain('tier: "internal"');
  });

  it('declares the internal token at most once even with multiple @internal commands', () => {
    const src = `
/** @internal */
defineCommand({ id: 'app.a', title: 'A', execute: () => null });
/** @internal */
defineCommand({ id: 'app.b', title: 'B', execute: () => null });
`;
    const { code } = transformSource(src);
    const count = (code.match(/__actureInternalToken__ = /g) ?? []).length;
    expect(count).toBe(1);
  });

  it('is idempotent on a spec that already declares tier:', () => {
    const src = `
/** @experimental */
defineCommand({ tier: 'stable', id: 'app.x', title: 'X', execute: () => null });
`;
    const { code, applied } = transformSource(src);
    expect(applied).toEqual([]);
    expect(code).toBe(src);
  });

  it('passes through files that do not call defineCommand', () => {
    const src = `export const x = 1;\nexport function f() { return x; }`;
    const { code, changed } = transformSource(src);
    expect(code).toBe(src);
    expect(changed).toBe(false);
  });

  it('passes through JSDoc that has no tier tag', () => {
    const src = `
/** Plain doc, no tier. */
defineCommand({ id: 'app.x', title: 'X', execute: () => null });
`;
    const { code, applied } = transformSource(src);
    expect(applied).toEqual([]);
    expect(code).toBe(src);
  });

  it('handles JSDoc that is not adjacent to defineCommand', () => {
    const src = `
/** Some other doc. */
const x = 1;

defineCommand({ id: 'app.x', title: 'X', execute: () => null });
`;
    const { code, applied } = transformSource(src);
    // The unrelated JSDoc has no tier tag; nothing should be transformed.
    expect(applied).toEqual([]);
    expect(code).toBe(src);
  });

  it('does not touch commands without a preceding JSDoc', () => {
    const src = `defineCommand({ id: 'app.x', title: 'X', execute: () => null });`;
    const { code, changed } = transformSource(src);
    expect(changed).toBe(false);
    expect(code).toBe(src);
  });

  it('handles JSDoc that has unrelated tags as well as @stable', () => {
    const src = `
/**
 * @param x — something
 * @returns y
 * @stable
 */
defineCommand({ id: 'app.x', title: 'X', execute: () => null });
`;
    const { code } = transformSource(src);
    expect(code).toContain('tier: "stable"');
  });
});
