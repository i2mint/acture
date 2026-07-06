/**
 * MCP server adapter — wraps `@modelcontextprotocol/sdk`'s `Server`
 * and wires the registry through `tools/list` and `tools/call`. Fires
 * `notifications/tools/list_changed` when the registry's tier-filtered
 * view changes (e.g., a command graduates from experimental to stable
 * via re-registration).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { Context, Registry, Tier } from 'acture';
import { buildToolsList, callTool } from './tools.js';
import {
  buildResourcesList,
  buildGetStateTool,
  callGetState,
  readResource,
  DEFAULT_GET_STATE_TOOL_NAME,
  type BuildResourcesListOptions,
  type GetStateToolOptions,
  type ViewSource,
} from './resources.js';

export interface CreateMcpServerOptions {
  /** Server name advertised in the MCP handshake. */
  name: string;
  /** Server version. Typically the consumer's package version. */
  version: string;
  /** Tier filter applied to `tools/list`. Default `['stable']`. */
  tiers?: readonly Tier[] | 'all';
  /** Static context passed to `dispatch` on every tool call. For
   *  contexts that change at request time, prefer the per-call form
   *  (call `tools` directly instead of using this server wrapper). */
  context?: Context;
  /** Optional READ side. Project a `ViewSource` (typed selectors over app
   *  state) as MCP resources — `resources/list` + `resources/read`, with
   *  `resources/subscribe` liveness wired to the source's `onStateChanged`.
   *  Omit for a tools-only server (the default; unchanged). The `tiers`
   *  filter above applies to views too (`internal` never projected). See
   *  the `acture-ai-assistant` skill and `docs/hand-written-view-registry.md`. */
  views?: ViewSource;
  /** URI scheme + prefix for state-resource URIs. Default `'app://state/'`. */
  resourceUriPrefix?: string;
  /** Also expose a read-only `getState` **tool** (the portable hedge for
   *  tools-only hosts that don't support MCP resources — research-11 §3.2).
   *  Requires `views`. `true` uses defaults; pass `GetStateToolOptions` to
   *  customize the name/description/tiers. Default: off. */
  getStateTool?: boolean | GetStateToolOptions;
}

/**
 * Build an MCP `Server` that proxies the acture registry. Caller is
 * responsible for connecting a transport (stdio or otherwise).
 */
export function createMcpServer(
  registry: Registry,
  options: CreateMcpServerOptions,
): Server {
  const server = new Server(
    { name: options.name, version: options.version },
    {
      capabilities: options.views
        ? { tools: { listChanged: true }, resources: { subscribe: true } }
        : { tools: { listChanged: true } },
    },
  );

  const listOptions: Parameters<typeof buildToolsList>[1] = options.tiers !== undefined
    ? { tiers: options.tiers }
    : {};

  // Optional read side. `views` also powers the getState TOOL below (the
  // portable hedge for tools-only hosts) and the resources block further down.
  const views = options.views;
  const getStateOpts: GetStateToolOptions | null =
    views && options.getStateTool
      ? typeof options.getStateTool === 'object'
        ? options.getStateTool
        : {}
      : null;
  const getStateName = getStateOpts
    ? getStateOpts.name ?? DEFAULT_GET_STATE_TOOL_NAME
    : null;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools:
      views && getStateOpts
        ? [...buildToolsList(registry, listOptions), buildGetStateTool(views, getStateOpts)]
        : buildToolsList(registry, listOptions),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params as { name: string; arguments?: unknown };
    const args = params.arguments ?? {};
    if (views && getStateName && params.name === getStateName) {
      const gs = callGetState(views, args);
      return { content: gs.content, ...(gs.isError ? { isError: true } : {}) };
    }
    const response = await callTool(registry, params.name, args, options.context);
    return {
      content: response.content,
      ...(response.isError ? { isError: true } : {}),
    };
  });

  // Fire tools/list_changed whenever the registry's view changes. The
  // SDK swallows notification errors so we don't try/catch.
  registry.onCommandsChanged(() => {
    void server.notification({ method: 'notifications/tools/list_changed' });
  });

  // ── Read side (optional) — resources/list + resources/read + subscribe ──
  if (views) {
    const listOpts: BuildResourcesListOptions = {};
    if (options.tiers !== undefined) listOpts.tiers = options.tiers;
    if (options.resourceUriPrefix !== undefined) listOpts.uriPrefix = options.resourceUriPrefix;
    const readOpts: { uriPrefix?: string } =
      options.resourceUriPrefix !== undefined ? { uriPrefix: options.resourceUriPrefix } : {};

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: buildResourcesList(views, listOpts),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params as { uri: string };
      // The pure `readResource` returns an SDK-free `ResourceContents`
      // mirror; upcast to the SDK's `ReadResourceResult` (structurally the
      // text-contents variant) so `resources.ts` keeps zero SDK dependency.
      return readResource(views, uri, readOpts) as ReadResourceResult;
    });

    // resources/subscribe → track URIs; fire resources/updated when the
    // ViewSource signals a state change. A ViewSource without
    // `onStateChanged` still supports subscribe; clients just re-read.
    const subscribed = new Set<string>();
    server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      subscribed.add((request.params as { uri: string }).uri);
      return {};
    });
    server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      subscribed.delete((request.params as { uri: string }).uri);
      return {};
    });
    views.onStateChanged?.(() => {
      for (const uri of subscribed) {
        void server.sendResourceUpdated({ uri });
      }
    });
  }

  return server;
}

/**
 * Convenience: bind the server to a fresh stdio transport. Returns a
 * promise that resolves when the transport finishes its handshake.
 */
export async function connectStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
