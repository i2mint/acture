import { describe, it, expect, vi } from 'vitest';
import { shadowCompare } from './shadow-compare.js';

describe('shadowCompare — sync', () => {
  it('returns modern result when modern and legacy agree', () => {
    const fn = shadowCompare(
      (x: number) => x * 2,
      (x: number) => x * 2,
      { logTo: null },
    );
    expect(fn(5)).toBe(10);
  });

  it('logs divergence when modern and legacy disagree, still returns modern', () => {
    const logTo = { warn: vi.fn() };
    const fn = shadowCompare(
      (x: number) => x * 2,
      (x: number) => x * 3,
      { logTo },
    );
    expect(fn(5)).toBe(10);
    expect(logTo.warn).toHaveBeenCalled();
  });

  it('legacy throwing does not propagate; logs warn', () => {
    const logTo = { warn: vi.fn() };
    const fn = shadowCompare(
      (x: number) => x * 2,
      () => {
        throw new Error('legacy boom');
      },
      { logTo },
    );
    expect(fn(3)).toBe(6);
    expect(logTo.warn).toHaveBeenCalled();
  });

  it('modern throwing propagates; legacy never called when modern threw before shadow', () => {
    const logTo = { warn: vi.fn() };
    const legacy = vi.fn(() => 1);
    const fn = shadowCompare(
      () => {
        throw new Error('modern boom');
      },
      legacy,
      { logTo },
    );
    expect(() => fn()).toThrow('modern boom');
    expect(legacy).not.toHaveBeenCalled();
  });

  it('sample = 0 skips legacy entirely', () => {
    const legacy = vi.fn(() => 1);
    const fn = shadowCompare(
      () => 2,
      legacy,
      { sample: 0, logTo: null },
    );
    fn();
    fn();
    expect(legacy).not.toHaveBeenCalled();
  });

  it('custom compare predicate is honored', () => {
    const logTo = { warn: vi.fn() };
    const fn = shadowCompare(
      () => ({ a: 1, b: 2 }),
      () => ({ a: 1, b: 2 }),
      {
        compare: (m, l) => m.a === l.a && m.b === l.b,
        logTo,
      },
    );
    expect(fn()).toEqual({ a: 1, b: 2 });
    expect(logTo.warn).not.toHaveBeenCalled();
  });

  it('deterministic sampling via custom rand', () => {
    const legacy = vi.fn(() => 0);
    let n = 0;
    const fn = shadowCompare(() => 0, legacy, {
      sample: 0.5,
      rand: () => (n++ % 2 === 0 ? 0.1 : 0.9),
      logTo: null,
    });
    fn();
    fn();
    fn();
    fn();
    expect(legacy).toHaveBeenCalledTimes(2);
  });
});

describe('shadowCompare — async', () => {
  it('returns the modern promise; logs divergence after resolution', async () => {
    const logTo = { warn: vi.fn() };
    const fn = shadowCompare(
      async () => 'modern',
      async () => 'legacy',
      { logTo },
    );
    await expect(fn()).resolves.toBe('modern');
    // Allow the comparison microtask to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(logTo.warn).toHaveBeenCalled();
  });

  it('async legacy rejection is logged, never thrown', async () => {
    const logTo = { warn: vi.fn() };
    const fn = shadowCompare(
      async () => 'modern',
      async () => {
        throw new Error('async legacy fail');
      },
      { logTo },
    );
    await expect(fn()).resolves.toBe('modern');
    await Promise.resolve();
    await Promise.resolve();
    expect(logTo.warn).toHaveBeenCalled();
  });
});
