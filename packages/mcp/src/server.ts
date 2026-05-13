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
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Context, Registry, Tier } from 'acture';
import { buildToolsList, callTool } from './tools.js';

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
    { capabilities: { tools: { listChanged: true } } },
  );

  const listOptions: Parameters<typeof buildToolsList>[1] = options.tiers !== undefined
    ? { tiers: options.tiers }
    : {};

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolsList(registry, listOptions),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params as { name: string; arguments?: unknown };
    const args = params.arguments ?? {};
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
