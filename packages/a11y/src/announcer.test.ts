import { describe, it, expect, afterEach } from 'vitest';
import { createRegistry, defineCommand, ok, err } from 'acture';
import { createAnnouncer, announceDispatches } from './announcer.js';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup() {
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({ id: 'app.t.good', title: 'Zoom to fit', execute: () => ok(1) }),
    defineCommand({ id: 'app.t.bad', title: 'Export', execute: () => err('io', 'disk full') }),
  ]);
  return registry;
}

describe('createAnnouncer', () => {
  it('mounts a visually hidden polite status region', () => {
    const a = createAnnouncer();
    const region = document.querySelector('[data-acture-announcer]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    a.announce('hello');
    expect(region.textContent).toBe('hello');
    a.dispose();
    expect(document.querySelector('[data-acture-announcer]')).toBeNull();
  });

  it('changes the DOM text when the same message repeats', () => {
    const a = createAnnouncer();
    const region = document.querySelector('[data-acture-announcer]')!;
    a.announce('same');
    const first = region.textContent;
    a.announce('same');
    expect(region.textContent).not.toBe(first);
    expect(region.textContent!.trim()).toBe('same');
  });

  it('uses role=alert for assertive', () => {
    createAnnouncer({ politeness: 'assertive' });
    const region = document.querySelector('[data-acture-announcer]')!;
    expect(region.getAttribute('role')).toBe('alert');
    expect(region.getAttribute('aria-live')).toBe('assertive');
  });
});

describe('announceDispatches', () => {
  it('announces success and failure, returning the Result unchanged', async () => {
    const registry = setup();
    const messages: string[] = [];
    announceDispatches(registry, { announcer: { announce: (m) => messages.push(m), dispose() {} } });
    const good = await registry.dispatch('app.t.good');
    const bad = await registry.dispatch('app.t.bad');
    expect(good).toEqual({ ok: true, value: 1 });
    expect(bad.ok).toBe(false);
    expect(messages).toEqual(['Zoom to fit done', 'Export failed: disk full']);
  });

  it('announces unknown commands by id', async () => {
    const registry = setup();
    const messages: string[] = [];
    announceDispatches(registry, { announcer: { announce: (m) => messages.push(m), dispose() {} } });
    const r = await registry.dispatch('nope');
    expect(r.ok).toBe(false);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^nope failed: /);
  });

  it('honours a custom formatter, and null stays silent', async () => {
    const registry = setup();
    const messages: string[] = [];
    announceDispatches(registry, {
      announcer: { announce: (m) => messages.push(m), dispose() {} },
      formatResult: ({ result }) => (result.ok ? null : 'Something went wrong'),
    });
    await registry.dispatch('app.t.good');
    await registry.dispatch('app.t.bad');
    expect(messages).toEqual(['Something went wrong']);
  });

  it('never breaks dispatch when the formatter or announcer throws', async () => {
    const registry = setup();
    announceDispatches(registry, {
      announcer: { announce: () => { throw new Error('boom'); }, dispose() {} },
    });
    expect((await registry.dispatch('app.t.good')).ok).toBe(true);
    announceDispatches(registry, {
      announcer: { announce() {}, dispose() {} },
      formatResult: () => { throw new Error('boom'); },
    });
    expect((await registry.dispatch('app.t.good')).ok).toBe(true);
  });

  it('dispose restores the previous dispatch', async () => {
    const registry = setup();
    const messages: string[] = [];
    const stop = announceDispatches(registry, {
      announcer: { announce: (m) => messages.push(m), dispose() {} },
    });
    stop();
    await registry.dispatch('app.t.good');
    expect(messages).toEqual([]);
  });

  it('works end to end with the DOM announcer', async () => {
    const registry = setup();
    const announcer = createAnnouncer();
    announceDispatches(registry, { announcer });
    await registry.dispatch('app.t.bad');
    expect(document.querySelector('[data-acture-announcer]')!.textContent).toContain('disk full');
  });
});
