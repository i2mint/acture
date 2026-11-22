import { describe, it, expect } from 'vitest';
import { commandIdToToolName, createRegistry, defineCommand, ok } from 'acture';
import { buildToolsList } from 'acture-mcp-server';
import { z } from 'zod';
import { registry } from './registry.js';
import { projectToWebMCP, type ModelContextLike } from './webmcp.js';

/** A stand-in for `document.modelContext`: tools live until their signal aborts. */
function fakeModelContext() {
  const tools = new Map<string, Parameters<ModelContextLike['registerTool']>[0]>();
  const mc: ModelContextLike = {
    registerTool(tool, options) {
      tools.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name));
    },
  };
  return { mc, tools };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WebMCP projection', () => {
  it('lists the same commands as the MCP server would', async () => {
    const { mc, tools } = fakeModelContext();
    const projection = projectToWebMCP(registry, { modelContext: mc });
    await projection.sync();
    const mcpNames = buildToolsList(registry).map((t) => t.name);
    expect([...tools.keys()].map(commandIdToToolName).sort()).toEqual(mcpNames.sort());
    projection.dispose();
    expect(tools.size).toBe(0);
  });

  it('calls go through dispatch, so params are validated', async () => {
    const { mc, tools } = fakeModelContext();
    const projection = projectToWebMCP(registry, { modelContext: mc });
    await projection.sync();
    const add = tools.get('app.todo.add')!;
    expect(add.inputSchema).toMatchObject({ type: 'object' });
    await expect(add.execute({ text: 42 })).rejects.toThrow();
    await expect(add.execute({ text: 'from an agent in the tab' })).resolves.toBeDefined();
    projection.dispose();
  });

  it('follows the when-context and the registry', async () => {
    const r = createRegistry();
    r.register(
      defineCommand({
        id: 'doc.save',
        title: 'Save',
        when: 'docDirty',
        execute: () => ok(true),
      }),
    );
    let ctx = { docDirty: false };
    const { mc, tools } = fakeModelContext();
    const projection = projectToWebMCP(r, { modelContext: mc, context: () => ctx });
    await projection.sync();
    expect(tools.has('doc.save')).toBe(false);
    ctx = { docDirty: true };
    await projection.sync(); // the host re-syncs after a context change
    expect(tools.has('doc.save')).toBe(true);
    r.register(
      defineCommand({
        id: 'doc.count',
        title: 'Count',
        params: z.object({ by: z.number().int() }),
        execute: ({ by }) => ok(by),
      }),
    );
    await settle(); // registry changes re-sync on their own
    expect(await tools.get('doc.count')!.execute({ by: 3 })).toBe(3);
    projection.dispose();
  });

  it('is a no-op without WebMCP', async () => {
    const projection = projectToWebMCP(registry);
    await expect(projection.sync()).resolves.toBeUndefined();
    projection.dispose();
  });
});
