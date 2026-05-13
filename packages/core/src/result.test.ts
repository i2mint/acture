/**
 * Direct tests for the Result helpers. They are tiny but they are part
 * of the v1 public API surface, so they get the same happy + error
 * coverage every other public export does.
 */

import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr } from './result.js';

describe('ok', () => {
  it('wraps a value in { ok: true, value }', () => {
    const r = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('preserves patches when provided', () => {
    const patches = [{ op: 'add', path: ['x'], value: 1 } as const];
    const r = ok(null, { patches });
    expect(r.ok && r.patches).toEqual(patches);
  });

  it('preserves effects when provided', () => {
    const effects = [{ type: 'log', msg: 'hi' }];
    const r = ok(null, { effects });
    expect(r.ok && r.effects).toEqual(effects);
  });

  it('omits patches/effects when not provided', () => {
    const r = ok(null);
    expect('patches' in r).toBe(false);
    expect('effects' in r).toBe(false);
  });
});

describe('err', () => {
  it('wraps a code/message into { ok: false, error }', () => {
    const r = err('boom', 'something bad');
    expect(r).toEqual({ ok: false, error: { code: 'boom', message: 'something bad' } });
  });

  it('attaches details when provided', () => {
    const r = err('boom', 'x', { stack: 'trace' });
    expect(r.error.details).toEqual({ stack: 'trace' });
  });
});

describe('isOk / isErr', () => {
  it('isOk recognizes a success', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err('e', 'm'))).toBe(false);
  });
  it('isErr recognizes a failure', () => {
    expect(isErr(err('e', 'm'))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });
});
