import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok, err } from 'acture';
import type { Registry } from 'acture';
import {
  recordSequence,
  replaySequence,
  replayTest,
  isAssertionStep,
} from './sequence.js';
import type { TestSequence } from './sequence.js';

/** A registry with a counter command, a setter command, and a command
 *  that always fails — enough to exercise record / replay / assert. */
function makeRegistry(): { registry: Registry; state: { count: number } } {
  const state = { count: 0 };
  const registry = createRegistry();
  registry.register(
    defineCommand({
      id: 'app.count.inc',
      title: 'Increment',
      execute: () => {
        state.count += 1;
        return ok(state.count);
      },
    }),
  );
  registry.register(
    defineCommand({
      id: 'app.count.set',
      title: 'Set count',
      params: z.object({ value: z.number() }),
      execute: ({ value }) => {
        state.count = value;
        return ok(state.count);
      },
    }),
  );
  registry.register(
    defineCommand({
      id: 'app.fail',
      title: 'Always fails',
      execute: () => err('boom', 'always fails'),
    }),
  );
  return { registry, state };
}

describe('recordSequence', () => {
  it('captures one step per dispatch, with params', async () => {
    const { registry } = makeRegistry();
    const recording = recordSequence(registry);

    await registry.dispatch('app.count.inc');
    await registry.dispatch('app.count.set', { value: 7 });

    recording.stop();
    expect(recording.steps).toEqual([
      { commandId: 'app.count.inc' },
      { commandId: 'app.count.set', params: { value: 7 } },
    ]);
  });

  it('still returns the real dispatch Result while recording', async () => {
    const { registry, state } = makeRegistry();
    const recording = recordSequence(registry);

    const result = await registry.dispatch('app.count.inc');

    expect(result).toEqual({ ok: true, value: 1 });
    expect(state.count).toBe(1);
    recording.stop();
  });

  it('records failing dispatches too — filtering is the caller\'s job', async () => {
    const { registry } = makeRegistry();
    const recording = recordSequence(registry);

    await registry.dispatch('app.fail');

    recording.stop();
    expect(recording.steps).toEqual([{ commandId: 'app.fail' }]);
  });

  it('stop() restores the original dispatch and is idempotent', async () => {
    const { registry } = makeRegistry();
    const recording = recordSequence(registry);
    await registry.dispatch('app.count.inc');
    recording.stop();
    recording.stop(); // no throw

    await registry.dispatch('app.count.inc');
    // The second dispatch happened after stop() — not recorded.
    expect(recording.steps).toEqual([{ commandId: 'app.count.inc' }]);
  });
});

describe('replaySequence', () => {
  it('replays steps through the registry and reports every Result', async () => {
    const { registry, state } = makeRegistry();
    const result = await replaySequence(registry, [
      { commandId: 'app.count.set', params: { value: 10 } },
      { commandId: 'app.count.inc' },
    ]);

    expect(result.ok).toBe(true);
    expect(state.count).toBe(11);
    expect(result.results.map((r) => r.result.ok)).toEqual([true, true]);
  });

  it('stops on the first failure by default', async () => {
    const { registry, state } = makeRegistry();
    const result = await replaySequence(registry, [
      { commandId: 'app.count.set', params: { value: 5 } },
      { commandId: 'app.fail' },
      { commandId: 'app.count.inc' },
    ]);

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(2); // inc never ran
    expect(state.count).toBe(5);
  });

  it('continues past failures when stopOnError is false', async () => {
    const { registry, state } = makeRegistry();
    const result = await replaySequence(
      registry,
      [
        { commandId: 'app.fail' },
        { commandId: 'app.count.inc' },
      ],
      { stopOnError: false },
    );

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(state.count).toBe(1); // inc still ran
  });

  it('invokes onStep after each step', async () => {
    const { registry } = makeRegistry();
    const onStep = vi.fn();
    await replaySequence(
      registry,
      [{ commandId: 'app.count.inc' }, { commandId: 'app.count.inc' }],
      { onStep },
    );
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('round-trips: record then replay reproduces the run', async () => {
    const a = makeRegistry();
    const recording = recordSequence(a.registry);
    await a.registry.dispatch('app.count.set', { value: 3 });
    await a.registry.dispatch('app.count.inc');
    recording.stop();

    const b = makeRegistry();
    await replaySequence(b.registry, recording.steps);
    expect(b.state.count).toBe(4);
  });
});

describe('replayTest', () => {
  it('runs command steps and assertion steps in order', async () => {
    const { registry, state } = makeRegistry();
    const seen: number[] = [];
    const sequence: TestSequence = [
      { commandId: 'app.count.set', params: { value: 2 } },
      { assert: () => void seen.push(state.count) },
      { commandId: 'app.count.inc' },
      { assert: () => void seen.push(state.count) },
    ];
    await replayTest(registry, sequence);
    expect(seen).toEqual([2, 3]);
  });

  it('throws when a command step fails', async () => {
    const { registry } = makeRegistry();
    await expect(
      replayTest(registry, [{ commandId: 'app.fail' }]),
    ).rejects.toThrow(/app\.fail.*always fails/);
  });

  it('lets a throwing assertion propagate to the runner', async () => {
    const { registry } = makeRegistry();
    await expect(
      replayTest(registry, [
        { commandId: 'app.count.inc' },
        { assert: () => { throw new Error('expected 99'); } },
      ]),
    ).rejects.toThrow('expected 99');
  });
});

describe('isAssertionStep', () => {
  it('distinguishes assertion steps from command steps', () => {
    expect(isAssertionStep({ commandId: 'x' })).toBe(false);
    expect(isAssertionStep({ assert: () => {} })).toBe(true);
  });
});
