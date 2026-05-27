import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok, err } from 'acture';
import { toAITools, toToolNameMap } from './index.js';

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
      tier: 'experimental',
      execute: () => ok(undefined),
    }),
    defineCommand({
      id: 'app.old.thing',
      title: 'Old thing',
      description: 'old.',
      tier: 'deprecated',
      execute: () => ok(undefined),
    }),
    defineCommand({
      id: 'app.broken',
      title: 'Broken',
      params: z.object({ x: z.number() }),
      execute: () => err('bad', 'failed'),
    }),
  ]);
  return { registry };
}

describe('toAITools', () => {
  it('keys by wire-safe tool name (dots replaced) and includes only stable commands by default', () => {
    const { registry } = setup();
    const tools = toAITools(registry);
    // The sanitized name reaches the model; the raw dotted id does NOT.
    expect(Object.keys(tools)).toContain('app_search');
    expect(Object.keys(tools)).not.toContain('app.search');
    expect(Object.keys(tools)).not.toContain('app_exp_thing');
  });

  it('every key matches the OpenAI/Anthropic tool-name regex (refs #24)', () => {
    // Regression: passing dotted command ids straight through made every
    // tool definition rejected by OpenAI/Anthropic with
    // `Invalid 'tools[0].function.name': … expected '^[a-zA-Z0-9_-]+$'`.
    const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: 'all' });
    expect(Object.keys(tools).length).toBeGreaterThan(0);
    for (const key of Object.keys(tools)) {
      expect(key).toMatch(TOOL_NAME);
    }
  });

  it('opt-in to experimental via tiers', () => {
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: ['stable', 'experimental'] });
    expect(Object.keys(tools)).toContain('app_exp_thing');
  });

  it('prefixes [DEPRECATED] on deprecated tool descriptions', () => {
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: ['stable', 'deprecated'] });
    const t = tools['app_old_thing']!;
    expect(t.description).toMatch(/^\[DEPRECATED\]/);
  });

  it('execute() returns the acture Result shape on success', async () => {
    const { registry } = setup();
    const tools = toAITools(registry);
    const t = tools['app_search']!;
    const out = await (t as unknown as { execute: (a: unknown) => Promise<unknown> }).execute(
      { query: 'foo' },
    );
    expect(out).toMatchObject({ ok: true, value: { hits: ['hit-for-foo'] } });
  });

  it('execute() returns the error shape on failure (errors-as-data)', async () => {
    const { registry } = setup();
    const tools = toAITools(registry);
    const t = tools['app_broken']!;
    const out = await (t as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      x: 1,
    });
    expect(out).toMatchObject({ ok: false, error: { code: 'bad' } });
  });

  it('fires onDispatched after each tool call with the original cmd record', async () => {
    const { registry } = setup();
    const onDispatched = vi.fn();
    const tools = toAITools(registry, { onDispatched });
    await (tools['app_search'] as unknown as { execute: (a: unknown) => Promise<unknown> }).execute(
      { query: 'x' },
    );
    expect(onDispatched).toHaveBeenCalledOnce();
    // The callback sees the canonical dotted id, not the sanitized name.
    const [cmd] = onDispatched.mock.calls[0]!;
    expect((cmd as { id: string }).id).toBe('app.search');
  });

  it('projects Zod v4 params to a non-empty JSON Schema', () => {
    // Regression: `ai` v4 converts a passed-through Zod schema with
    // `zod-to-json-schema` (Zod v3 only) and silently yields an empty
    // `{}` for a Zod v4 schema — the model then sees no parameters. The
    // adapter must convert via `z.toJSONSchema()` itself.
    const { registry } = setup();
    const tools = toAITools(registry);
    const params = (
      tools['app_search'] as unknown as {
        parameters: {
          jsonSchema?: { type?: string; properties?: Record<string, unknown> };
        };
      }
    ).parameters;
    expect(params.jsonSchema?.type).toBe('object');
    expect(params.jsonSchema?.properties ?? {}).toHaveProperty('query');
  });

  it('projects a param-less command to an empty object schema', () => {
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: ['stable', 'experimental'] });
    const params = (
      tools['app_exp_thing'] as unknown as {
        parameters: { jsonSchema?: { type?: string } };
      }
    ).parameters;
    expect(params.jsonSchema?.type).toBe('object');
  });
});

describe('toToolNameMap', () => {
  it('inverts toAITools so consumers can recover cmd.id from a tool-call name', () => {
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: 'all' });
    const nameToId = toToolNameMap(registry, { tiers: 'all' });
    // Every key in the projected tools record has a corresponding id.
    for (const key of Object.keys(tools)) {
      expect(nameToId[key]).toBeDefined();
    }
    expect(nameToId['app_search']).toBe('app.search');
    expect(nameToId['app_exp_thing']).toBe('app.exp.thing');
  });

  it('respects the same tier filter as toAITools', () => {
    const { registry } = setup();
    const map = toToolNameMap(registry); // default: stable only
    expect(map['app_search']).toBe('app.search');
    expect(map['app_exp_thing']).toBeUndefined();
    expect(map['app_old_thing']).toBeUndefined();
  });
});
