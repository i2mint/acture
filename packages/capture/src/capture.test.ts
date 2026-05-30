import { describe, expect, it } from 'vitest';
import { screenshotsIdentical } from './capture.js';
import {
  captureManifestSchema,
  journeySchema,
  manifestStepSchema,
} from './manifest.js';

describe('screenshotsIdentical', () => {
  it('is true for byte-identical buffers', () => {
    expect(
      screenshotsIdentical(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3])),
    ).toBe(true);
  });
  it('is false for differing length or content', () => {
    expect(screenshotsIdentical(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3]))).toBe(
      false,
    );
    expect(
      screenshotsIdentical(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 9, 3])),
    ).toBe(false);
  });
});

describe('journeySchema', () => {
  it('validates a well-formed journey', () => {
    const j = journeySchema.parse({
      slug: 'quickstart',
      title: 'A tour',
      intro: 'hi',
      steps: [
        { narration: 'spread', commandId: 'view.layout.set', params: { mode: 'spread' } },
        { narration: 'palette', commandId: 'shell.commandPalette.open' },
      ],
    });
    expect(j.steps).toHaveLength(2);
    expect(j.steps[0]!.commandId).toBe('view.layout.set');
  });
  it('rejects a step missing commandId', () => {
    expect(() =>
      journeySchema.parse({ slug: 's', title: 't', steps: [{ narration: 'x' }] }),
    ).toThrow();
  });
});

describe('manifest schemas', () => {
  it('a manifest step extends a journey step with capture fields', () => {
    const step = manifestStepSchema.parse({
      narration: 'n',
      commandId: 'a.b',
      index: 1,
      before: '01-before.png',
      after: '01-before.png',
      collapsed: true,
      dispatch: { success: true },
    });
    expect(step.collapsed).toBe(true);
    expect(step.after).toBe(step.before);
  });
  it('validates a full manifest', () => {
    const m = captureManifestSchema.parse({
      slug: 'demo',
      title: 'Demo',
      capturedAt: '2026-05-30T00:00:00.000Z',
      steps: [
        {
          narration: 'n',
          commandId: 'a.b',
          index: 1,
          before: '01-before.png',
          after: '01-after.png',
          collapsed: false,
          dispatch: { success: false, message: 'boom' },
        },
      ],
    });
    expect(m.steps[0]!.dispatch.success).toBe(false);
    expect(m.steps[0]!.dispatch.message).toBe('boom');
  });
});
