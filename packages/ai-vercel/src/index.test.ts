import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRegistry, defineCommand, ok, err } from 'acture';
import { toAITools } from './index.js';

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
  it('keys by command id and includes only stable commands by default', () => {
    const { registry } = setup();
    const tools = toAITools(registry);
    expect(Object.keys(tools)).toContain('app.search');
    expect(Object.keys(tools)).not.toContain('app.exp.thing');
  });

  it('opt-in to experimental via tiers', () => {
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: ['stable', 'experimental'] });
    expect(Object.keys(tools)).toContain('app.exp.thing');
  });

  it('prefixes [DEPRECATED] on deprecated tool descriptions', () => {
    const { registry } = setup();
    const tools = toAITools(registry, { tiers: ['stable', 'deprecated'] });
    const t = tools['app.old.thing']!;
    expect(t.description).toMatch(/^\[DEPRECATED\]/);
  });

  it('execute() returns the acture Result shape on success', async () => {
    const { registry } = setup();
    const tools = toAITools(registry);
    const t = tools['app.search']!;
    const out = await (t as unknown as { execute: (a: unknown) => Promise<unknown> }).execute(
      { query: 'foo' },
    );
    expect(out).toMatchObject({ ok: true, value: { hits: ['hit-for-foo'] } });
  });

  it('execute() returns the error shape on failure (errors-as-data)', async () => {
    const { registry } = setup();
    const tools = toAITools(registry);
    const t = tools['app.broken']!;
    const out = await (t as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      x: 1,
    });
    expect(out).toMatchObject({ ok: false, error: { code: 'bad' } });
  });

  it('fires onDispatched after each tool call', async () => {
    const { registry } = setup();
    const onDispatched = vi.fn();
    const tools = toAITools(registry, { onDispatched });
    await (tools['app.search'] as unknown as { execute: (a: unknown) => Promise<unknown> }).execute(
      { query: 'x' },
    );
    expect(onDispatched).toHaveBeenCalledOnce();
  });

  it('projects Zod v4 params to a non-empty JSON Schema', () => {
    // Regression: `ai` v4 converts a passed-through Zod schema with
    // `zod-to-json-schema` (Zod v3 only) and silently yields an empty
    // `{}` for a Zod v4 schema — the model then sees no parameters. The
    // adapter must convert via `z.toJSONSchema()` itself.
    const { registry } = setup();
    const tools = toAITools(registry);
    const params = (
      tools['app.search'] as unknown as {
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
      tools['app.exp.thing'] as unknown as {
        parameters: { jsonSchema?: { type?: string } };
      }
    ).parameters;
    expect(params.jsonSchema?.type).toBe('object');
  });
});
