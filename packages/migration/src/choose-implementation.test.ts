import { describe, it, expect, vi } from 'vitest';
import { chooseImplementation } from './choose-implementation.js';

describe('chooseImplementation', () => {
  it('routes to modern when pick returns modern', () => {
    const fn = chooseImplementation(() => 'modern', {
      legacy: (x: number) => x + 1,
      modern: (x: number) => x * 10,
    });
    expect(fn(5)).toBe(50);
  });

  it('routes to legacy when pick returns legacy', () => {
    const fn = chooseImplementation(() => 'legacy', {
      legacy: (x: number) => x + 1,
      modern: (x: number) => x * 10,
    });
    expect(fn(5)).toBe(6);
  });

  it('evaluates pick on every call (runtime flag flip)', () => {
    let mode: 'legacy' | 'modern' = 'legacy';
    const fn = chooseImplementation(() => mode, {
      legacy: () => 'L',
      modern: () => 'M',
    });
    expect(fn()).toBe('L');
    mode = 'modern';
    expect(fn()).toBe('M');
  });

  it('forwards arguments to the selected impl', () => {
    const legacy = vi.fn((a: number, b: number) => a + b);
    const modern = vi.fn((a: number, b: number) => a * b);
    const fn = chooseImplementation(() => 'modern', { legacy, modern });
    fn(2, 3);
    expect(modern).toHaveBeenCalledWith(2, 3);
    expect(legacy).not.toHaveBeenCalled();
  });
});
