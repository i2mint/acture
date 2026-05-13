/**
 * Result<R> helpers. `ok` / `err` are the canonical way to construct
 * a result from inside an `execute` handler. Throwing inside `execute`
 * is also fine — the dispatcher catches and converts to `err`.
 */

import type { CommandError, Effect, Patch, Result } from './types.js';

export function ok<R>(
  value: R,
  extras?: { patches?: readonly Patch[]; effects?: readonly Effect[] },
): Result<R> {
  const result: Result<R> = { ok: true, value };
  if (extras?.patches !== undefined) {
    (result as { patches?: readonly Patch[] }).patches = extras.patches;
  }
  if (extras?.effects !== undefined) {
    (result as { effects?: readonly Effect[] }).effects = extras.effects;
  }
  return result;
}

export function err(
  code: string,
  message: string,
  details?: unknown,
): Result<never> {
  const error: CommandError = details === undefined
    ? { code, message }
    : { code, message, details };
  return { ok: false, error };
}

export function isOk<R>(r: Result<R>): r is Extract<Result<R>, { ok: true }> {
  return r.ok === true;
}

export function isErr<R>(r: Result<R>): r is Extract<Result<R>, { ok: false }> {
  return r.ok === false;
}
