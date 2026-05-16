// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import { z } from 'zod';
import { createDomInterceptor } from './dom-interceptor.js';

function newRoot(): HTMLDivElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createDomInterceptor', () => {
  it('dispatches a registered command on click', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({ ran: true }));
    registry.register(
      defineCommand({ id: 'app.foo.run', title: 'Run', execute }),
    );

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.foo.run">Go</button>`;
    const mount = createDomInterceptor(registry);
    const unmount = mount(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('walks ancestors to find data-acture-command (event delegation)', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.x.go', title: 'X', execute }),
    );

    const root = newRoot();
    root.innerHTML = `
      <div data-acture-command="app.x.go">
        <span>icon</span><span class="label">Click me</span>
      </div>
    `;
    const unmount = createDomInterceptor(registry)(root);

    (root.querySelector('.label')! as HTMLElement).click();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('reads JSON params from data-acture-params', async () => {
    const registry = createRegistry();
    const execute = vi.fn((p) => ok(p));
    registry.register(
      defineCommand({
        id: 'app.note.add',
        title: 'Add',
        params: z.object({ title: z.string() }),
        execute,
      }),
    );

    const root = newRoot();
    root.innerHTML = `
      <button
        data-acture-command="app.note.add"
        data-acture-params='{"title":"hello"}'>Add</button>
    `;
    const unmount = createDomInterceptor(registry)(root);
    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledWith({ title: 'hello' }, expect.any(Object));
    unmount();
  });

  it('uses paramsFrom callback when provided', async () => {
    const registry = createRegistry();
    const execute = vi.fn((p) => ok(p));
    registry.register(
      defineCommand({
        id: 'app.form.save',
        title: 'Save',
        params: z.object({ name: z.string() }),
        execute,
      }),
    );

    const root = newRoot();
    root.innerHTML = `
      <form data-acture-command="app.form.save">
        <input name="name" value="Alice" />
        <button type="submit">Save</button>
      </form>
    `;
    const unmount = createDomInterceptor(registry, {
      events: ['submit'],
      paramsFrom: (event) => {
        const form = event.target as HTMLFormElement;
        return Object.fromEntries(new FormData(form));
      },
    })(root);

    const form = root.querySelector('form')! as HTMLFormElement;
    form.requestSubmit();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledWith({ name: 'Alice' }, expect.any(Object));
    unmount();
  });

  it('does not dispatch unregistered ids by default (requireRegistered: true)', async () => {
    const registry = createRegistry();
    const onDispatch = vi.fn();
    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.missing.x">x</button>`;
    const unmount = createDomInterceptor(registry, { onDispatch })(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onDispatch).not.toHaveBeenCalled();
    unmount();
  });

  it('dispatches unregistered ids when requireRegistered: false', async () => {
    const registry = createRegistry();
    const onDispatch = vi.fn();
    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.absent.y">y</button>`;
    const unmount = createDomInterceptor(registry, {
      requireRegistered: false,
      onDispatch,
    })(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onDispatch).toHaveBeenCalledWith('app.absent.y', undefined);
    unmount();
  });

  it('preventDefault is true for submit by default', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'app.f.s', title: 'S', execute: () => ok({}) }),
    );
    const root = newRoot();
    root.innerHTML = `<form data-acture-command="app.f.s"></form>`;
    const unmount = createDomInterceptor(registry)(root);

    const form = root.querySelector('form')! as HTMLFormElement;
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    unmount();
  });

  it('preventDefault is false for click by default', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'app.c.k', title: 'K', execute: () => ok({}) }),
    );
    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.c.k">k</button>`;
    const unmount = createDomInterceptor(registry)(root);

    const btn = root.querySelector('button')! as HTMLButtonElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    unmount();
  });

  it('custom preventDefault function is honored', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'app.x.y', title: 'Y', execute: () => ok({}) }),
    );
    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.x.y">y</button>`;
    const unmount = createDomInterceptor(registry, {
      preventDefault: (_event, id) => id === 'app.x.y',
    })(root);

    const btn = root.querySelector('button')! as HTMLButtonElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    unmount();
  });

  it('unmount detaches all event types', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.u.m', title: 'M', execute }),
    );

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.u.m">m</button>`;
    const unmount = createDomInterceptor(registry)(root);
    unmount();

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
  });

  it('respects custom event types', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.k.b', title: 'B', execute }),
    );

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.k.b">b</button>`;
    const unmount = createDomInterceptor(registry, {
      events: ['keydown'],
    })(root);

    // Click should NOT fire — we registered only keydown.
    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();

    // Keydown SHOULD fire.
    (root.querySelector('button')! as HTMLButtonElement).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true }),
    );
    await Promise.resolve();
    expect(execute).toHaveBeenCalled();

    unmount();
  });

  it('respects custom attribute name', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.alt.a', title: 'A', execute }),
    );

    const root = newRoot();
    root.innerHTML = `<button data-cmd="app.alt.a">a</button>`;
    const unmount = createDomInterceptor(registry, {
      attribute: 'data-cmd',
    })(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('skips silently on malformed params JSON', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.j.b', title: 'B', execute }),
    );

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.j.b" data-acture-params="{ not json }">b</button>`;
    const unmount = createDomInterceptor(registry)(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    // The command was still dispatched, but with undefined params.
    expect(execute).toHaveBeenCalledTimes(1);
    expect((execute.mock.calls[0] as unknown[])[0]).toBeUndefined();
    unmount();
  });

  it('onMalformedAttribute fires when params JSON fails to parse, without breaking dispatch', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.j.m', title: 'M', execute }),
    );
    const onMalformed = vi.fn();

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.j.m" data-acture-params="{ not json }">m</button>`;
    const unmount = createDomInterceptor(registry, {
      onMalformedAttribute: onMalformed,
    })(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onMalformed).toHaveBeenCalledTimes(1);
    const [raw, el, err] = onMalformed.mock.calls[0]!;
    expect(raw).toBe('{ not json }');
    expect((el as Element).getAttribute('data-acture-command')).toBe('app.j.m');
    expect(err).toBeInstanceOf(SyntaxError);
    // Dispatch still proceeded with undefined params (existing behavior preserved).
    expect(execute).toHaveBeenCalledTimes(1);
    expect((execute.mock.calls[0] as unknown[])[0]).toBeUndefined();
    unmount();
  });

  it('an onMalformedAttribute that throws does not break dispatch', async () => {
    const registry = createRegistry();
    const execute = vi.fn(() => ok({}));
    registry.register(
      defineCommand({ id: 'app.j.t', title: 'T', execute }),
    );

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.j.t" data-acture-params="{nope}">t</button>`;
    const unmount = createDomInterceptor(registry, {
      onMalformedAttribute: () => {
        throw new Error('observer boom');
      },
    })(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    // Dispatch still ran despite the observer throwing.
    expect(execute).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('onDispatch fires with id + params for every routed event', async () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({
        id: 'app.p.n',
        title: 'N',
        params: z.object({ x: z.number() }),
        execute: () => ok({}),
      }),
    );
    const onDispatch = vi.fn();

    const root = newRoot();
    root.innerHTML = `<button data-acture-command="app.p.n" data-acture-params='{"x":7}'>n</button>`;
    const unmount = createDomInterceptor(registry, { onDispatch })(root);

    (root.querySelector('button')! as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onDispatch).toHaveBeenCalledWith('app.p.n', { x: 7 });
    unmount();
  });
});
