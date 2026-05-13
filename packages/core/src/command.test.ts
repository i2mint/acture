import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCommand, RegistrationError } from './command.js';
import { ok } from './result.js';

describe('defineCommand', () => {
  it('freezes the result', () => {
    const cmd = defineCommand({
      id: 'app.test.noop',
      title: 'Noop',
      execute: () => ok(undefined as void),
    });
    expect(Object.isFrozen(cmd)).toBe(true);
  });

  describe('id validation', () => {
    it('accepts well-formed namespaced ids', () => {
      for (const id of [
        'app.test.noop',
        'app.graph.addNode',
        'app.view.zoomToFit',
        'a.b.c.d.e',
        'app.x1.y2',
      ]) {
        expect(() =>
          defineCommand({ id, title: 't', execute: () => ok(0) }),
        ).not.toThrow();
      }
    });

    it.each([
      ['', 'empty'],
      ['App.Test.Noop', 'capital first letter'],
      ['app.test_noop', 'underscore'],
      ['app.test-noop', 'hyphen'],
      ['app.', 'trailing dot'],
      ['.app.test', 'leading dot'],
      ['app..test', 'double dot'],
      ['1app.test.noop', 'leading digit'],
    ])('rejects malformed id "%s" (%s)', (id) => {
      expect(() =>
        defineCommand({ id, title: 't', execute: () => ok(0) }),
      ).toThrow(RegistrationError);
    });
  });

  describe('param schema validation', () => {
    it('accepts schemas in the JSON-representable subset', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.simple',
          title: 't',
          params: z.object({
            x: z.number(),
            label: z.string().optional(),
            tags: z.array(z.string()),
          }),
          execute: () => ok(undefined as void),
        }),
      ).not.toThrow();
    });

    it('rejects z.date in params', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.bad',
          title: 't',
          params: z.object({ when: z.date() }),
          execute: () => ok(undefined as void),
        }),
      ).toThrow(/z\.date/);
    });

    it('rejects z.bigint in params', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.bad',
          title: 't',
          params: z.object({ amount: z.bigint() }),
          execute: () => ok(undefined as void),
        }),
      ).toThrow(/bigint/);
    });

    it('rejects z.transform in params', () => {
      const inner = z.string().transform((s) => s.length);
      expect(() =>
        defineCommand({
          id: 'app.test.bad',
          title: 't',
          params: z.object({ s: inner }),
          execute: () => ok(undefined as void),
        }),
      ).toThrow(/transform|pipe|coercion/i);
    });

    it('rejects deeply-nested z.date', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.bad',
          title: 't',
          params: z.object({
            outer: z.object({
              middle: z.array(z.object({ when: z.date() })),
            }),
          }),
          execute: () => ok(undefined as void),
        }),
      ).toThrow(/z\.date/);
    });
  });

  describe('when-clause validation', () => {
    it('accepts DSL strings', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.cond',
          title: 't',
          when: 'editor.focused && !view.readonly',
          execute: () => ok(undefined as void),
        }),
      ).not.toThrow();
    });

    it('accepts function escape hatch', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.cond',
          title: 't',
          when: (ctx) => ctx['editor.focused'] === true,
          execute: () => ok(undefined as void),
        }),
      ).not.toThrow();
    });

    it('rejects malformed DSL', () => {
      expect(() =>
        defineCommand({
          id: 'app.test.cond',
          title: 't',
          when: 'editor.focused && && view.readonly',
          execute: () => ok(undefined as void),
        }),
      ).toThrow(/parse|when-clause/i);
    });
  });

  it('rejects unknown kind', () => {
    expect(() =>
      defineCommand({
        id: 'app.test.k',
        title: 't',
        // @ts-expect-error -- runtime check
        kind: 'mystery',
        execute: () => ok(undefined as void),
      }),
    ).toThrow(/kind/);
  });

  it('rejects unknown tier', () => {
    expect(() =>
      defineCommand({
        id: 'app.test.t',
        title: 't',
        // @ts-expect-error -- runtime check
        tier: 'released',
        execute: () => ok(undefined as void),
      }),
    ).toThrow(/tier/);
  });
});
