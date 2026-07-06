/**
 * Read-side projection — the registry's sibling. Where `tools.ts` projects
 * COMMANDS (actions) to MCP tools, this projects VIEWS (typed selectors over
 * application state) to MCP resources: the read side an assistant needs to
 * *see* current state before it acts (research-11 §3 — the read side is the
 * industry-wide gap). Pure functions — no SDK dependency — so any transport
 * can consume them; the SDK glue lives in `server.ts`.
 *
 * A **view** is the read-side dual of a command. The `ViewSource` shape here
 * mirrors the hand-written `ViewRegistry` (`docs/hand-written-view-registry.md`):
 * `list` / `read` / optional `onStateChanged`. acture-mcp never touches the
 * state library — the app supplies the `ViewSource`, closing over its own
 * adapter and selectors.
 */

import type { Tier } from 'acture';

/** A view descriptor as listed by a {@link ViewSource} — the read-side dual
 *  of an MCP tool descriptor. The selector and state live in the app's
 *  `ViewSource`, never here. */
export interface ResourceView {
  /** URI-friendly id, e.g. `'app.selection'` → `'app://state/app.selection'`. */
  id: string;
  /** Model-facing: what this view means and when to read it. */
  description?: string;
  /** Default `'stable'`. `'internal'` is never projected. */
  tier?: Tier;
}

/** The read-side source the projection consumes. Mirrors the `ViewRegistry`
 *  shape in `docs/hand-written-view-registry.md` — the app supplies it, so
 *  acture-mcp stays state-library-agnostic. */
export interface ViewSource {
  /** Tier-filtered listing. Default `['stable']`; `'internal'` never listed. */
  list(options?: { tiers?: readonly Tier[] | 'all' }): readonly ResourceView[];
  /** Current value for a view id; JSON-serialized on read. Returns
   *  `undefined` for an unknown / filtered / secret view. */
  read(id: string): unknown;
  /** Optional liveness hook: fire when any view's value may have changed.
   *  Returns an unsubscribe. `server.ts` wires it to
   *  `notifications/resources/updated` for subscribed URIs. */
  onStateChanged?(listener: () => void): () => void;
}

/** MCP resource descriptor for `resources/list`. Mirrors the SDK shape so a
 *  host without the SDK on its classpath can consume this module too. */
export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

export interface BuildResourcesListOptions {
  /** Tier filter. Default `['stable']` — mirrors `buildToolsList`. */
  tiers?: readonly Tier[] | 'all';
  /** URI scheme + prefix. Default `'app://state/'`. */
  uriPrefix?: string;
}

/** Default URI scheme+prefix for state views. */
export const DEFAULT_RESOURCE_PREFIX = 'app://state/';

/**
 * Project a `ViewSource` as MCP resource descriptors for `resources/list`.
 * Symmetric to {@link buildToolsList} on the write side: a parameterized
 * projection (tier filter passed through), not adapter business logic.
 */
export function buildResourcesList(
  views: ViewSource,
  options: BuildResourcesListOptions = {},
): McpResourceDescriptor[] {
  const prefix = options.uriPrefix ?? DEFAULT_RESOURCE_PREFIX;
  const tiers = options.tiers ?? ['stable'];
  return views.list({ tiers }).map((v) => {
    const out: McpResourceDescriptor = {
      uri: `${prefix}${v.id}`,
      name: v.id,
      mimeType: 'application/json',
    };
    if (v.description !== undefined) out.description = v.description;
    return out;
  });
}

/** MCP resource contents, mirroring `ReadResourceResult`'s text-contents shape. */
export interface ResourceContents {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

/**
 * Read one view's current value as MCP resource contents. The value is
 * JSON-serialized; an unknown / filtered / `secret` view (where
 * `views.read` returns `undefined`) reads as `null` — no leak, no throw.
 */
export function readResource(
  views: ViewSource,
  uri: string,
  options: { uriPrefix?: string } = {},
): ResourceContents {
  const prefix = options.uriPrefix ?? DEFAULT_RESOURCE_PREFIX;
  const id = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
  const value = views.read(id);
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(value ?? null, null, 2),
      },
    ],
  };
}

/** Map a view id to its resource URI. Inverse of the id-extraction in
 *  {@link readResource}; used by the server to track subscribed URIs. */
export function viewIdToUri(id: string, uriPrefix = DEFAULT_RESOURCE_PREFIX): string {
  return `${uriPrefix}${id}`;
}
