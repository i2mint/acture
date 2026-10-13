/**
 * Dispatch-result announcer (WCAG 4.1.3 Status Messages, research-12 §3.4).
 *
 * A command that succeeds or fails after the palette closes changes nothing a
 * screen reader can see. `announceDispatches` observes every `registry.dispatch`
 * and routes the `Result` to a polite `aria-live` region, so one install covers
 * every surface (palette, hotkeys, menus, AI, macros).
 *
 *     const announcer = createAnnouncer();
 *     const stop = announceDispatches(registry, { announcer });
 *
 * Like `acture-telemetry`, this wraps `registry.dispatch` (dispatch observation
 * belongs in opt-in adapter packages, not core). Dispose in reverse install
 * order if other instrumenters wrap the same registry.
 */

import type { AnyCommandRecord, Context, DispatchOptions, Registry, Result } from 'acture';

/** A sink for status messages. `createAnnouncer` is the DOM implementation. */
export interface Announcer {
  /** Speak `message` without moving focus. */
  announce(message: string): void;
  /** Remove the live region. */
  dispose(): void;
}

export interface CreateAnnouncerOptions {
  /** `'polite'` (default) waits for the user to be idle; `'assertive'` interrupts. */
  readonly politeness?: 'polite' | 'assertive';
  /** Where to mount the region. Default: `document.body`. */
  readonly root?: HTMLElement;
}

/** Visually hidden but still exposed to assistive technology. */
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0,0,0,0);white-space:nowrap;border:0';

/**
 * Mount a visually hidden `role="status"` live region and return an
 * {@link Announcer} for it. Announcing the same text twice in a row still
 * speaks twice (the text alternates a trailing no-break space, so the DOM
 * actually changes).
 */
export function createAnnouncer(options: CreateAnnouncerOptions = {}): Announcer {
  const root = options.root ?? document.body;
  const politeness = options.politeness ?? 'polite';
  const region = root.ownerDocument.createElement('div');
  region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  region.setAttribute('aria-live', politeness);
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('data-acture-announcer', '');
  region.style.cssText = VISUALLY_HIDDEN;
  root.appendChild(region);

  let flip = false;
  return {
    announce(message: string): void {
      flip = !flip;
      region.textContent = flip ? message : `${message} `;
    },
    dispose(): void {
      region.remove();
    },
  };
}

/** What `formatResult` receives for each dispatch. */
export interface AnnounceInfo {
  /** The registered record, or `undefined` for an unknown id. */
  readonly command: AnyCommandRecord | undefined;
  readonly commandId: string;
  readonly result: Result<unknown>;
}

/** Return the message to announce, or `null`/`''` to stay silent. */
export type FormatResult = (info: AnnounceInfo) => string | null;

/**
 * Default message: a failure reads `"<title> failed: <message>"`; a success
 * reads `"<title> done"`. Pass your own `formatResult` to speak the outcome
 * instead (`"3 nodes deleted"`) or to silence successes whose effect is
 * already visible.
 */
export const defaultFormatResult: FormatResult = ({ command, commandId, result }) => {
  const name = command?.title ?? commandId;
  return result.ok ? `${name} done` : `${name} failed: ${result.error.message}`;
};

export interface AnnounceDispatchesOptions {
  /** Where messages go. Required. */
  readonly announcer: Announcer;
  /** Message per dispatch. Default {@link defaultFormatResult}. */
  readonly formatResult?: FormatResult;
}

/**
 * Wrap `registry.dispatch` so every call's `Result` is announced. A throwing
 * `formatResult` or announcer is swallowed: announcing must never break
 * dispatch. Returns a disposer that restores the previous `dispatch`.
 */
export function announceDispatches(
  registry: Registry,
  options: AnnounceDispatchesOptions,
): () => void {
  const { announcer, formatResult = defaultFormatResult } = options;
  const originalDispatch = registry.dispatch.bind(registry);

  (registry as { dispatch: Registry['dispatch'] }).dispatch = async function announcedDispatch<R>(
    id: string,
    params?: unknown,
    ctx?: Context,
    opts?: DispatchOptions,
  ): Promise<Result<R>> {
    const result = (await originalDispatch<R>(id, params, ctx, opts)) as Result<R>;
    try {
      const message = formatResult({
        command: registry.get(id),
        commandId: id,
        result: result as Result<unknown>,
      });
      if (message) announcer.announce(message);
    } catch {
      // intentionally swallow — see doc comment
    }
    return result;
  };

  return () => {
    (registry as { dispatch: Registry['dispatch'] }).dispatch = originalDispatch;
  };
}
