#!/usr/bin/env node
/**
 * MCP server for the drop-in example. The graph state lives in the
 * Node process that runs this script; for a real drop-in deployment
 * you'd proxy to your actual API layer instead. The point of this
 * script: showing that the SAME registry that powers the browser
 * palette also serves MCP — no separate "AI-tools" definitions.
 */

import { createMcpServer, connectStdio } from 'acture-mcp-server';
import { registry } from '../src/registry.js';

const server = createMcpServer(registry, {
  name: 'acture-drop-in-todo',
  version: '0.1.0-dev',
});

await connectStdio(server);
