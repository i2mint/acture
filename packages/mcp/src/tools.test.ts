import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok, err } from 'acture';
import { buildToolsList, callTool, formatToolResponse } from './tools.js';

function setup() {
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({
      id: 'app.search',
      title: 'Search',
      description: 'Search the corpus.',
      params: z.object({ query: z.string().min(1) }),
      execute: (p) => ok({ hits: [`hit-for-${p.query}`] }),
    }),
    defineCommand({
      id: 'app.exp.thing',
      title: 'Exp thing',
      description: 'Experimental.',
      tier: 'experimental',
      execute: () => ok({ tag: 'exp' }),
    }),
    defineCommand({
      id: 'app.old.thing',
      title: 'Old thing',
      description: 'Original description.',
      tier: 'deprecated',
      deprecationReason: 'use app.new.thing instead',
      execute: () => ok({ tag: 'old' }),
    }),
    defineCommand({
      id: 'app.bare.deprecated',
      title: 'Bare deprecated',
      description: 'No reason given.',
      tier: 'deprecated',
      execute: () => ok({ tag: 'bare' }),
    }),
    defineCommand({
      id: 'app.fn.gated',
      title: 'Fn gated',
      description: 'Has a function when-clause; should be skipped by default.',
      when: () => true,
      execute: () => ok(undefined),
    }),
  ]);
  return { registry };
}

describe('buildToolsList', () => {
  it('includes only stable commands by default', () => {
    const { registry } = setup();
    const tools = buildToolsList(registry);
    const names = tools.map((t) => t.name);
    expect(names).toContain('app.search');
    expect(names).not.toContain('app.exp.thing');
  });

  it('includes experimental when explicitly opted-in', () => {
    const { registry } = setup();
    const tools = buildToolsList(registry, { tiers: ['stable', 'experimental'] });
    const names = tools.map((t) => t.name);
    expect(names).toContain('app.exp.thing');
  });

  it('prefixes [DEPRECATED — <reason>] when deprecationReason is set', () => {
    const { registry } = setup();
    const tools = buildToolsList(registry, { tiers: ['stable', 'deprecated'] });
    const dep = tools.find((t) => t.name === 'app.old.thing');
    expect(dep).toBeDefined();
    expect(dep!.description).toMatch(
      /^\[DEPRECATED — use app\.new\.thing instead\] Original description\.$/,
    );
  });

  it('falls back to bare [DEPRECATED] when no reason is set', () => {
    const { registry } = setup();
    const tools = buildToolsList(registry, { tiers: ['stable', 'deprecated'] });
    const dep = tools.find((t) => t.name === 'app.bare.deprecated');
    expect(dep).toBeDefined();
    expect(dep!.description).toMatch(/^\[DEPRECATED\] No reason given\.$/);
  });

  it('excludes commands with function-form when by default', () => {
    const { registry } = setup();
    const tools = buildToolsList(registry);
    expect(tools.find((t) => t.name === 'app.fn.gated')).toBeUndefined();
  });

  it('inputSchema is always an object schema', () => {
    const { registry } = setup();
    const tools = buildToolsList(registry);
    for (const t of tools) {
      expect(t.inputSchema['type']).toBe('object');
    }
  });
});

describe('callTool', () => {
  it('returns MCP content array on success', async () => {
    const { registry } = setup();
    const response = await callTool(registry, 'app.search', { query: 'foo' });
    expect(response.content).toHaveLength(1);
    expect(response.content[0]!.type).toBe('text');
    expect(JSON.parse(response.content[0]!.text)).toEqual({ hits: ['hit-for-foo'] });
    expect(response.isError).toBeUndefined();
  });

  it('returns isError: true for invalid params (errors-as-data)', async () => {
    const { registry } = setup();
    const response = await callTool(registry, 'app.search', { query: '' });
    expect(response.isError).toBe(true);
  });

  it('returns isError: true for unknown commands', async () => {
    const { registry } = setup();
    const response = await callTool(registry, 'no.such.tool', {});
    expect(response.isError).toBe(true);
  });
});

describe('formatToolResponse', () => {
  it('formats ok results as JSON-text content', () => {
    const r = formatToolResponse(ok({ count: 3 }));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0]!.text)).toEqual({ count: 3 });
  });

  it('formats err results as isError + JSON-text content', () => {
    const r = formatToolResponse(err('bad', 'failed'));
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ code: 'bad', message: 'failed' });
  });
});
