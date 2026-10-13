import { describe, it, expect } from 'vitest';
import { createRegistry, defineCommand, ok } from 'acture';
import { createMcpServer } from './server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ViewSource } from './resources.js';

function makeViews(): ViewSource {
  return {
    list: () => [{ id: 'app.selection', tier: 'stable' }],
    read: (id) => (id === 'app.selection' ? ['n1'] : undefined),
  };
}

describe('createMcpServer — getState/command tool-name collision guard', () => {
  it('throws when a command sanitizes to the getState tool name (default)', () => {
    const registry = createRegistry();
    // `app.getState` → sanitized wire name `app_getState` === DEFAULT_GET_STATE_TOOL_NAME.
    registry.register(
      defineCommand({ id: 'app.getState', title: 'Get', execute: () => ok(undefined) }),
    );
    expect(() =>
      createMcpServer(registry, {
        name: 't',
        version: '0.0.0',
        views: makeViews(),
        getStateTool: true,
      }),
    ).toThrow(/collides with a command/i);
  });

  it('throws when a command collides with a custom getState tool name', () => {
    const registry = createRegistry();
    // `app.readState` sanitizes (dot → underscore) to `app_readState`.
    registry.register(
      defineCommand({ id: 'app.readState', title: 'Read', execute: () => ok(undefined) }),
    );
    expect(() =>
      createMcpServer(registry, {
        name: 't',
        version: '0.0.0',
        views: makeViews(),
        getStateTool: { name: 'app_readState' },
      }),
    ).toThrow(/collides with a command/i);
  });

  it('does not throw when there is no collision', () => {
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'app.search', title: 'Search', execute: () => ok(undefined) }),
    );
    expect(() =>
      createMcpServer(registry, {
        name: 't',
        version: '0.0.0',
        views: makeViews(),
        getStateTool: true,
      }),
    ).not.toThrow();
  });

  it('does not check for a collision when the getState tool is disabled', () => {
    const registry = createRegistry();
    // A command named app.getState is harmless when the getState tool is off.
    registry.register(
      defineCommand({ id: 'app.getState', title: 'Get', execute: () => ok(undefined) }),
    );
    expect(() =>
      createMcpServer(registry, { name: 't', version: '0.0.0', views: makeViews() }),
    ).not.toThrow();
  });
});

describe('createMcpServer — tools/list follows the context (#67)', () => {
  async function listedNames(context: Parameters<typeof createMcpServer>[1]['context']) {
    const registry = createRegistry();
    registry.registerAll([
      defineCommand({ id: 'app.always', title: 'Always', execute: () => ok(undefined) }),
      defineCommand({
        id: 'app.edit.save',
        title: 'Save',
        when: 'editor.focused',
        execute: () => ok(undefined),
      }),
    ]);
    const server = createMcpServer(registry, { name: 't', version: '0.0.0', ...(context ? { context } : {}) });
    const client = new Client({ name: 'c', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      return (await client.listTools()).tools.map((t) => t.name);
    } finally {
      await client.close();
      await server.close();
    }
  }

  it('hides an unavailable command, and lists everything without a context', async () => {
    expect(await listedNames({ editor: { focused: false } })).toEqual(['app_always']);
    expect(await listedNames({ editor: { focused: true } })).toEqual(['app_always', 'app_edit_save']);
    expect(await listedNames(undefined)).toEqual(['app_always', 'app_edit_save']);
  });

  it('reads a context function per request', async () => {
    let focused = false;
    const registry = createRegistry();
    registry.register(
      defineCommand({ id: 'app.edit.save', title: 'Save', when: 'editor.focused', execute: () => ok(undefined) }),
    );
    const server = createMcpServer(registry, {
      name: 't',
      version: '0.0.0',
      context: () => ({ editor: { focused } }),
    });
    const client = new Client({ name: 'c', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      expect((await client.listTools()).tools).toHaveLength(0);
      focused = true;
      expect((await client.listTools()).tools).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
