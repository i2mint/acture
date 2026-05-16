/**
 * `createDomInterceptor` — the DOM half of the Event Interception pattern
 * (Cartwright/Horn/Lewis [16], per research-4 §A.5). Companion to
 * `actureMiddleware`, which handles store events.
 *
 * What it does: attaches a single delegated listener per configured event
 * type to a root node. On each event, walks up from the target until it
 * finds an element marked with `data-acture-command="<id>"` (the attribute
 * name is configurable). If the id is registered, the interceptor calls
 * `registry.dispatch(id, params)` and optionally `event.preventDefault()`.
 *
 * What it does NOT do:
 *   - It does NOT replace React's synthetic event system. Listeners are
 *     attached to a real DOM root with the standard `addEventListener`
 *     API. Both React's synthetic handlers AND the interceptor run for
 *     the same event, in the order React → interceptor (React runs in
 *     the bubble phase before listeners on outer DOM nodes, unless the
 *     interceptor uses `{ capture: true }`).
 *   - It does NOT cross shadow DOM boundaries unless the host mounts a
 *     separate interceptor inside each shadow root. (Composed events
 *     surface in the light DOM with retargeted `event.target`, but
 *     `data-acture-command` resolution stops at the shadow boundary.)
 *   - It does NOT touch React Portals automatically. Portals render
 *     elsewhere in the DOM tree; if those elements should be intercepted,
 *     mount a second interceptor on the portal root.
 *
 * Parameter sourcing:
 *   - Default: read `data-acture-params` and `JSON.parse` it. Empty /
 *     missing means `params = undefined`.
 *   - Configurable via `paramsFrom(event, el)` for custom extraction
 *     (e.g. reading form data from `event.target`).
 *
 * Hard-don't rails:
 *   - **No React imports.** This module is plain TS so it works in
 *     vanilla apps, Solid, Svelte, Preact, or React. React adapters
 *     can wrap this in a component, but `createDomInterceptor` itself
 *     does not need React. (hard-don't #6.)
 *   - **No `eval` on user strings.** `data-acture-params` is parsed via
 *     `JSON.parse` (which is safe — produces only data) and never
 *     reflectively invoked. The id is looked up via `registry.has(id)`,
 *     not via dynamic dispatch. (hard-don't #5.)
 *   - **No business logic.** This is a translation layer: DOM event →
 *     command dispatch. Decisions about which commands exist, what
 *     params they take, when they are allowed — all of that lives in
 *     the registry and the commands themselves.
 */

import type { Registry } from 'acture';

export interface DomInterceptorOptions {
  /** Event types to listen for. Defaults to `['click', 'submit', 'change']`.
   *  Submit is included so `<form data-acture-command="app.foo.save">`
   *  works on form submission. */
  events?: readonly string[];
  /** Attribute that holds the command id. Defaults to `data-acture-command`.
   *  Use a custom attribute if your app already namespaces data-* attrs
   *  for another tool (e.g. `data-cmd`). */
  attribute?: string;
  /** Attribute that holds JSON-encoded params. Defaults to
   *  `data-acture-params`. */
  paramsAttribute?: string;
  /** Custom params extractor. Receives the event and the resolved
   *  element. Return `undefined` to fall back to `data-acture-params`. */
  paramsFrom?: (event: Event, element: Element) => unknown;
  /** Call `event.preventDefault()` after a successful dispatch. Default:
   *  `true` for `submit` events, `false` otherwise. Per-event control
   *  via a callback overrides the default. */
  preventDefault?: boolean | ((event: Event, id: string) => boolean);
  /** Require the command id to be registered before dispatching. Default:
   *  `true`. Set `false` to dispatch unknown ids (useful for development
   *  observability — `registry.dispatch` returns an `unknown_command`
   *  err result the host can log). */
  requireRegistered?: boolean;
  /** Use the capture phase. Default `false` (bubble). Setting `true` lets
   *  the interceptor run before any nested React handler can call
   *  `stopPropagation` on the event. */
  capture?: boolean;
  /** Called on every dispatch result. Useful for telemetry / audit. */
  onDispatch?: (id: string, params: unknown) => void;
  /** Called when `data-acture-params` (or the configured params attribute)
   *  contains malformed JSON. The interceptor still proceeds with
   *  `params = undefined` — this hook only exists to make the swallow
   *  observable for debugging. Receives the raw attribute value, the
   *  resolved element, and the underlying parse error. */
  onMalformedAttribute?: (
    raw: string,
    element: Element,
    error: unknown,
  ) => void;
}

/** Returned by `createDomInterceptor`. Call to start watching a root node;
 *  call the returned function to detach. */
export type DomInterceptorMount = (
  root: Element | Document,
) => () => void;

const DEFAULT_EVENTS = ['click', 'submit', 'change'] as const;
const DEFAULT_ATTRIBUTE = 'data-acture-command';
const DEFAULT_PARAMS_ATTRIBUTE = 'data-acture-params';

/**
 * Build a DOM-event interceptor bound to a registry. Returns a `mount`
 * function the host calls to attach listeners to a root node.
 *
 * @example
 *   const mount = createDomInterceptor(registry);
 *   const unmount = mount(document.body);
 *   // ... later
 *   unmount();
 *
 * @example
 *   // Custom params extraction from forms.
 *   const mount = createDomInterceptor(registry, {
 *     events: ['submit'],
 *     paramsFrom: (event) => {
 *       const form = event.target as HTMLFormElement;
 *       return Object.fromEntries(new FormData(form));
 *     },
 *   });
 */
export function createDomInterceptor(
  registry: Registry,
  options: DomInterceptorOptions = {},
): DomInterceptorMount {
  const events = options.events ?? DEFAULT_EVENTS;
  const attribute = options.attribute ?? DEFAULT_ATTRIBUTE;
  const paramsAttribute = options.paramsAttribute ?? DEFAULT_PARAMS_ATTRIBUTE;
  const requireRegistered = options.requireRegistered ?? true;
  const capture = options.capture ?? false;
  const onDispatch = options.onDispatch;
  const onMalformedAttribute = options.onMalformedAttribute;
  const userPreventDefault = options.preventDefault;
  const userParamsFrom = options.paramsFrom;

  return (root) => {
    const handler = (event: Event): void => {
      const target = event.target;
      if (!isElement(target)) return;
      const el = findAncestorWithAttribute(target, attribute);
      if (!el) return;
      const id = el.getAttribute(attribute);
      if (!id) return;
      if (requireRegistered && !registry.has(id)) return;

      let params: unknown;
      if (userParamsFrom) {
        params = userParamsFrom(event, el);
      }
      if (params === undefined) {
        params = readJsonAttribute(el, paramsAttribute, onMalformedAttribute);
      }

      // Fire-and-forget. `registry.dispatch` returns a Promise<Result>;
      // observers can read it via `onDispatch` or by subscribing to the
      // registry's listener bus separately. We swallow the promise here
      // so a slow async command doesn't block the DOM event handler.
      void registry.dispatch(id, params);
      onDispatch?.(id, params);

      if (shouldPreventDefault(event, id, userPreventDefault)) {
        event.preventDefault();
      }
    };

    for (const type of events) {
      root.addEventListener(type, handler, capture);
    }

    return () => {
      for (const type of events) {
        root.removeEventListener(type, handler, capture);
      }
    };
  };
}

/* ───────────────────────── internals ──────────────────────────────── */

function isElement(target: EventTarget | null): target is Element {
  return target !== null && typeof (target as Element).getAttribute === 'function';
}

function findAncestorWithAttribute(
  start: Element,
  attribute: string,
): Element | null {
  let el: Element | null = start;
  while (el) {
    if (el.hasAttribute(attribute)) return el;
    el = el.parentElement;
  }
  return null;
}

function readJsonAttribute(
  el: Element,
  attribute: string,
  onMalformed?: (raw: string, element: Element, error: unknown) => void,
): unknown {
  const raw = el.getAttribute(attribute);
  if (raw === null || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Malformed JSON in a data-attribute is a user error. We swallow it
    // and pass `undefined` rather than crash the event handler. Hosts
    // who want strict behavior should validate at write time, or pass
    // `onMalformedAttribute` to observe these cases.
    if (onMalformed) {
      try {
        onMalformed(raw, el, e);
      } catch {
        // Observer errors must not break dispatch. Same rule as the
        // registry's listener-error path.
      }
    }
    return undefined;
  }
}

function shouldPreventDefault(
  event: Event,
  id: string,
  user: DomInterceptorOptions['preventDefault'],
): boolean {
  if (typeof user === 'function') return user(event, id);
  if (typeof user === 'boolean') return user;
  // Default: prevent for submit (otherwise the form posts), allow for
  // click/change (let the host UI keep its native semantics).
  return event.type === 'submit';
}
