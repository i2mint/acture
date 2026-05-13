#!/usr/bin/env node
/**
 * MCP server entry point for the graph-editor example. Exposes every
 * stable graph-editor command as an MCP tool. Run via:
 *
 *     pnpm --filter @acture/example-graph-editor mcp
 *
 * Inspect with:
 *
 *     npx @modelcontextprotocol/inspector node \
 *       ./examples/greenfield/graph-editor/scripts/mcp-server.ts
 *
 * Or wire it into Claude Desktop / any MCP-compatible client.
 *
 * IMPORTANT: this script holds the graph state in this Node process.
 * It is a stand-alone "server" view of the same registry the browser
 * uses — they do NOT share state. A real production setup would proxy
 * to a single source of truth via your existing API layer.
 */

import { createZustandAdapter } from '@acture/state-zustand';
import { createRegistry } from 'acture';
import { createMcpServer, connectStdio } from '@acture/mcp';
import { buildCommands } from '../src/commands/index.js';
import { initialGraphState, type GraphState } from '../src/state.js';

const state = createZustandAdapter<GraphState>({ initialState: initialGraphState });
const registry = createRegistry();
registry.registerAll(buildCommands(state as unknown as Parameters<typeof buildCommands>[0]));

const server = createMcpServer(registry, {
  name: 'acture-graph-editor',
  version: '0.1.0-dev',
  tiers: ['stable'],
});

await connectStdio(server);

// Optional: log final state on shutdown. stderr is safe — stdio
// transport uses stdin/stdout for protocol frames.
process.on('SIGINT', () => {
  process.stderr.write(`\nFinal graph state:\n${JSON.stringify(state.getState(), null, 2)}\n`);
  process.exit(0);
});
