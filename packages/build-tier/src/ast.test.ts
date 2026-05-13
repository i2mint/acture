/**
 * Tests for AST-mode tier mirror. Mirrors the structure of
 * `transform.test.ts` for the regex mode, with extra cases for the
 * regex's known fall-throughs (large spec bodies, template-literal
 * substitutions).
 */

import { describe, it, expect } from 'vitest';
import { transformSourceAst } from './ast.js';

describe('transformSourceAst — parity with regex mode', () => {
  it('returns source unchanged when no defineCommand call is present', () => {
    const src = `export const x = 1;`;
    const { code, changed } = transformSourceAst(src);
    expect(code).toBe(src);
    expect(changed).toBe(false);
  });

  it('injects tier: experimental for @experimental', () => {
    const src = `
      /** @experimental */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code, applied } = transformSourceAst(src);
    expect(code).toContain('tier: "experimental"');
    expect(applied).toEqual([{ tier: 'experimental' }]);
  });

  it('injects tier: stable for @stable', () => {
    const src = `
      /** @stable */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toContain('tier: "stable"');
  });

  it('injects deprecationReason for @deprecated with reason', () => {
    const src = `
      /** @deprecated use foo instead */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toContain('tier: "deprecated"');
    expect(code).toContain('deprecationReason: "use foo instead"');
  });

  it('injects internalToken and module-scoped symbol for @internal', () => {
    const src = `
      /** @internal */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toMatch(/^const __actureInternalToken__ = .* Symbol\('acture\.internal'\);/);
    expect(code).toContain('internalToken: __actureInternalToken__');
  });

  it('is idempotent on a spec that already declares tier:', () => {
    const src = `
      /** @experimental */
      const x = defineCommand({ tier: 'stable', id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code, changed } = transformSourceAst(src);
    expect(changed).toBe(false);
    expect(code).toContain("tier: 'stable'");
    // The transform left the manual 'stable' alone — no second tier prop.
    expect(code.match(/tier:/g)?.length).toBe(1);
  });

  it('ignores defineCommand without a JSDoc block', () => {
    const src = `const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });`;
    const { changed } = transformSourceAst(src);
    expect(changed).toBe(false);
  });

  it('honors @internal precedence over @experimental', () => {
    const src = `
      /**
       * @experimental
       * @internal
       */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toContain('tier: "internal"');
    expect(code).toContain('internalToken: __actureInternalToken__');
    expect(code).not.toContain('tier: "experimental"');
  });

  it('handles multiple defineCommand calls in one file', () => {
    const src = `
      /** @stable */
      const a = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });

      /** @experimental */
      const b = defineCommand({ id: 'b', title: 'B', execute: () => ok({}) });

      /** @deprecated use a */
      const c = defineCommand({ id: 'c', title: 'C', execute: () => ok({}) });
    `;
    const { code, applied } = transformSourceAst(src);
    expect(code).toContain('tier: "stable"');
    expect(code).toContain('tier: "experimental"');
    expect(code).toContain('tier: "deprecated"');
    expect(code).toContain('deprecationReason: "use a"');
    expect(applied).toHaveLength(3);
  });

  it('handles bare defineCommand calls without a const binding', () => {
    const src = `
      /** @experimental */
      defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toContain('tier: "experimental"');
  });

  it('handles export const wrapping', () => {
    const src = `
      /** @experimental */
      export const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toContain('tier: "experimental"');
  });

  it('only one symbol declaration even with multiple @internal commands', () => {
    const src = `
      /** @internal */
      const a = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });

      /** @internal */
      const b = defineCommand({ id: 'b', title: 'B', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    const decls = code.match(/__actureInternalToken__ = .* Symbol\('acture\.internal'\)/g);
    expect(decls?.length).toBe(1);
  });

  it('leaves un-tagged commands alone next to tagged ones', () => {
    const src = `
      const a = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });

      /** @experimental */
      const b = defineCommand({ id: 'b', title: 'B', execute: () => ok({}) });
    `;
    const { code, applied } = transformSourceAst(src);
    expect(applied).toEqual([{ tier: 'experimental' }]);
    // The first command's spec still has no tier.
    expect(code.match(/tier:/g)?.length).toBe(1);
  });
});

describe('transformSourceAst — handles cases the regex falls through on', () => {
  it('handles a spec body larger than the regex 4000-char lookahead window', () => {
    const filler = "field: '" + 'x'.repeat(4500) + "',";
    const src = `
      /** @experimental */
      const big = defineCommand({
        ${filler}
        id: 'big',
        title: 'Big',
        execute: () => ok({}),
      });
    `;
    const { code, applied } = transformSourceAst(src);
    expect(applied).toEqual([{ tier: 'experimental' }]);
    expect(code).toContain('tier: "experimental"');
  });

  it('handles template-literal substitutions with braces inside the spec', () => {
    const src =
      '/** @experimental */\n' +
      "const x = defineCommand({\n" +
      "  id: `app.${'a'}.b`,\n" +
      "  title: `Title-${'x'}-${{ foo: 1 }['foo']}`,\n" +
      "  description: `mixed ${`nested-${'y'}`}`,\n" +
      "  execute: () => ok({}),\n" +
      "});\n";
    const { code, applied } = transformSourceAst(src);
    expect(applied).toEqual([{ tier: 'experimental' }]);
    expect(code).toContain('tier: "experimental"');
  });

  it('handles JSDoc with extra padding / whitespace', () => {
    const src = `
      /**
       *   Some description here.
       *
       *   @experimental
       *
       *   More notes.
       */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });
    `;
    const { code } = transformSourceAst(src);
    expect(code).toContain('tier: "experimental"');
  });

  it('attributes JSDoc correctly to the immediately-following declaration', () => {
    const src = `
      /** unrelated docblock */
      function helper() {}

      /** @experimental */
      const x = defineCommand({ id: 'a', title: 'A', execute: () => ok({}) });

      const y = defineCommand({ id: 'b', title: 'B', execute: () => ok({}) });
    `;
    const { applied, code } = transformSourceAst(src);
    expect(applied).toEqual([{ tier: 'experimental' }]);
    // Only the @experimental one got tier.
    expect(code.match(/tier:/g)?.length).toBe(1);
  });
});
