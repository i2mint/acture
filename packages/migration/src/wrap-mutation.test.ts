import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry } from 'acture';
import { wrapMutation, readWrappedCommandId } from './wrap-mutation.js';

describe('wrapMutation — call-site invocation', () => {
  it('preserves the handler signature and return value', () => {
    const handler = (a: number, b: number): number => a + b;
    const wrapped = wrapMutation(handler);
    expect(wrapped(2, 3)).toBe(5);
  });

  it('forwards thrown errors from the handler to the call site', () => {
    const wrapped = wrapMutation(() => {
      throw new Error('boom');
    });
    expect(() => wrapped()).toThrow('boom');
  });

  it('preserves async results', async () => {
    const wrapped = wrapMutation(async (n: number) => n * 2);
    await expect(wrapped(5)).resolves.toBe(10);
  });

  it('fires onDispatch with the resolved id and args', () => {
    const onDispatch = vi.fn();
    const wrapped = wrapMutation((x: string) => x.toUpperCase(), {
      id: 'app.demo.upper',
      onDispatch,
    });
    wrapped('hello');
    expect(onDispatch).toHaveBeenCalledWith('app.demo.upper', ['hello']);
  });

  it('logs a debug entry by default in dev', () => {
    const logTo = { debug: vi.fn() };
    const wrapped = wrapMutation(() => 1, { id: 'app.demo.noop', logTo });
    wrapped();
    expect(logTo.debug).toHaveBeenCalled();
  });

  it('logTo: null silences logging', () => {
    const wrapped = wrapMutation(() => 1, { id: 'app.demo.quiet', logTo: null });
    expect(() => wrapped()).not.toThrow();
  });
});

describe('wrapMutation — id derivation', () => {
  it('uses handler.name → app.wrapped.<name>', () => {
    function addTodo(): number {
      return 1;
    }
    const wrapped = wrapMutation(addTodo);
    expect(readWrappedCommandId(wrapped)).toBe('app.wrapped.addTodo');
  });

  it('falls back to app.wrapped.fn<N> for anonymous handlers', () => {
    const wrapped = wrapMutation(() => 0);
    const id = readWrappedCommandId(wrapped);
    expect(id).toMatch(/^app\.wrapped\.fn\d+$/);
  });

  it('respects an explicit id option', () => {
    const wrapped = wrapMutation(() => 0, { id: 'app.project.save' });
    expect(readWrappedCommandId(wrapped)).toBe('app.project.save');
  });
});

describe('wrapMutation — registry integration', () => {
  it('registers a command when a registry is provided', () => {
    const registry = createRegistry();
    wrapMutation(() => 'ok', {
      id: 'app.demo.run',
      title: 'Run demo',
      registry,
    });
    expect(registry.has('app.demo.run')).toBe(true);
    const cmd = registry.get('app.demo.run')!;
    expect(cmd.title).toBe('Run demo');
  });

  it('dispatching the registered command calls the handler', async () => {
    const registry = createRegistry();
    const handler = vi.fn(() => 'ok');
    wrapMutation(handler, { id: 'app.demo.run', registry });
    const result = await registry.dispatch('app.demo.run');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('ok');
    expect(handler).toHaveBeenCalled();
  });

  it('dispatching with params calls the handler with the parsed params object', async () => {
    const registry = createRegistry();
    const handler = vi.fn((params: { text: string }) => params.text.length);
    wrapMutation(handler, {
      id: 'app.todo.add',
      registry,
      params: z.object({ text: z.string().min(1) }),
    });
    const result = await registry.dispatch('app.todo.add', { text: 'hi' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(2);
    expect(handler).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('schema validation at registry boundary produces invalid_params on bad input', async () => {
    const registry = createRegistry();
    wrapMutation((params: { text: string }) => params.text, {
      id: 'app.todo.add',
      registry,
      params: z.object({ text: z.string().min(1) }),
    });
    const result = await registry.dispatch('app.todo.add', { text: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_params');
  });

  it('handler that throws inside execute is caught as errors-as-data', async () => {
    const registry = createRegistry();
    wrapMutation(
      () => {
        throw new Error('explode');
      },
      { id: 'app.demo.explode', registry },
    );
    const result = await registry.dispatch('app.demo.explode');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('handler_threw');
      expect(result.error.message).toBe('explode');
    }
  });

  it('async handler resolves through the dispatch path', async () => {
    const registry = createRegistry();
    wrapMutation(async () => 42, { id: 'app.demo.async', registry });
    const result = await registry.dispatch('app.demo.async');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('no registry → no command registered (telemetry-only mode)', () => {
    const registry = createRegistry();
    wrapMutation(() => 1, { id: 'app.demo.silent' });
    expect(registry.has('app.demo.silent')).toBe(false);
  });
});
