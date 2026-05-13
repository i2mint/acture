import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import { deriveKind, summarizeParams, isPickerSchema, readEnumOptions } from './derive-kind.js';

describe('deriveKind', () => {
  it('0 params → atomic', () => {
    const cmd = defineCommand({ id: 'a', title: 'A', execute: () => ok(0) });
    expect(deriveKind(cmd)).toBe('atomic');
  });

  it('1 enum param → atomic', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({ tier: z.enum(['low', 'mid', 'high']) }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('atomic');
  });

  it('1 boolean param → atomic', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({ enabled: z.boolean() }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('atomic');
  });

  it('1 unconstrained string param → handoff', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({ name: z.string() }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('handoff');
  });

  it('2 picker-typed params → atomic', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({ op: z.enum(['add', 'mul']), enabled: z.boolean() }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('atomic');
  });

  it('3 picker-typed params with defaults → atomic', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({
        a: z.enum(['x', 'y']).default('x'),
        b: z.enum(['p', 'q']).default('p'),
        c: z.boolean().default(false),
      }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('atomic');
  });

  it('3 picker-typed params WITHOUT defaults → handoff', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({
        a: z.enum(['x', 'y']),
        b: z.enum(['p', 'q']),
        c: z.boolean(),
      }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('handoff');
  });

  it('3 free-text params → handoff', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({ x: z.number(), y: z.number(), label: z.string() }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('handoff');
  });

  it('4+ params → handoff (always)', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({
        a: z.boolean().default(false),
        b: z.boolean().default(false),
        c: z.boolean().default(false),
        d: z.boolean().default(false),
      }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('handoff');
  });

  it('explicit kind overrides the heuristic', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      kind: 'atomic',
      params: z.object({ x: z.number(), y: z.number(), label: z.string() }),
      execute: () => ok(0),
    });
    expect(deriveKind(cmd)).toBe('atomic');
  });
});

describe('summarizeParams', () => {
  it('reports per-field picker-ness and defaultness', () => {
    const cmd = defineCommand({
      id: 'a',
      title: 'A',
      params: z.object({
        op: z.enum(['add', 'mul']).default('add'),
        label: z.string(),
      }),
      execute: () => ok(0),
    });
    const s = summarizeParams(cmd);
    expect(s).toHaveLength(2);
    expect(s[0]!.name).toBe('op');
    expect(s[0]!.isPicker).toBe(true);
    expect(s[0]!.hasDefault).toBe(true);
    expect(s[1]!.name).toBe('label');
    expect(s[1]!.isPicker).toBe(false);
    expect(s[1]!.hasDefault).toBe(false);
  });
});

describe('isPickerSchema', () => {
  it('treats z.enum as picker', () => {
    expect(isPickerSchema(z.enum(['a', 'b']))).toBe(true);
  });
  it('treats z.boolean as picker', () => {
    expect(isPickerSchema(z.boolean())).toBe(true);
  });
  it('treats unconstrained z.string as non-picker', () => {
    expect(isPickerSchema(z.string())).toBe(false);
  });
  it('treats z.number as non-picker', () => {
    expect(isPickerSchema(z.number())).toBe(false);
  });
});

describe('readEnumOptions', () => {
  it('returns the enum values', () => {
    const opts = readEnumOptions(z.enum(['a', 'b', 'c']));
    expect(opts).toEqual(['a', 'b', 'c']);
  });
  it('returns [] for non-enums', () => {
    expect(readEnumOptions(z.string())).toEqual([]);
  });
});
