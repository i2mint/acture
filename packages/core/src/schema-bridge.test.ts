import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCommand } from './command.js';
import { ok } from './result.js';
import { toJsonSchema } from './schema-bridge.js';

describe('toJsonSchema', () => {
  it('emits empty-object schema for commands with no params', () => {
    const cmd = defineCommand({
      id: 'app.t.noparams',
      title: 'noparams',
      description: 'No params here',
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd);
    expect(env.name).toBe('app.t.noparams');
    expect(env.description).toBe('No params here');
    expect(env.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('omits description when includeDescription=false', () => {
    const cmd = defineCommand({
      id: 'app.t.noparams',
      title: 'noparams',
      description: 'hidden',
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd, { includeDescription: false });
    expect(env.description).toBeUndefined();
  });

  it('projects a Zod object schema as JSON Schema', () => {
    const cmd = defineCommand({
      id: 'app.graph.addNode',
      title: 'Add node',
      description: 'Add a node to the graph at (x, y) with label.',
      params: z.object({
        x: z.number(),
        y: z.number(),
        label: z.string(),
      }),
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd);
    expect(env.name).toBe('app.graph.addNode');
    expect(env.description).toBe('Add a node to the graph at (x, y) with label.');
    expect(env.inputSchema).toMatchInlineSnapshot(`
      {
        "additionalProperties": false,
        "properties": {
          "label": {
            "type": "string",
          },
          "x": {
            "type": "number",
          },
          "y": {
            "type": "number",
          },
        },
        "required": [
          "x",
          "y",
          "label",
        ],
        "type": "object",
      }
    `);
  });

  it('round-trips the inputSchema through JSON', () => {
    const cmd = defineCommand({
      id: 'app.t.rt',
      title: 'rt',
      params: z.object({
        n: z.number().int(),
        s: z.string().min(1),
        tags: z.array(z.string()),
      }),
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd);
    const json = JSON.stringify(env.inputSchema);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(env.inputSchema);
  });

  it('accepts an injected converter', () => {
    const cmd = defineCommand({
      id: 'app.t.inj',
      title: 'inj',
      params: z.object({ x: z.number() }),
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd, {
      converter: () => ({ type: 'object', properties: { custom: { type: 'boolean' } } }),
    });
    expect(env.inputSchema).toEqual({
      type: 'object',
      properties: { custom: { type: 'boolean' } },
    });
  });

  it('strict mode emits warnings about preserved constraints', () => {
    const cmd = defineCommand({
      id: 'app.t.strict',
      title: 'strict',
      params: z.object({
        name: z.string().min(2).max(10),
      }),
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd, { strict: true });
    expect(env.inputSchema['additionalProperties']).toBe(false);
    expect(env.warnings).toBeDefined();
    expect((env.warnings ?? []).join(' ')).toMatch(/minLength|maxLength/);
  });

  it('strict mode walks union branches and makes optional keys nullable (#90)', () => {
    const cmd = defineCommand({
      id: 'app.t.strictUnion',
      title: 'strict union',
      params: z.object({
        selection: z.union([
          z.object({ kind: z.literal('ids'), ids: z.array(z.string()) }),
          z.object({ kind: z.literal('query'), search: z.string().optional(), expectedCount: z.number().int().optional() }),
        ]).optional(),
        tag: z.string(),
      }),
      execute: () => ok(undefined as void),
    });
    const s = toJsonSchema(cmd, { strict: true }).inputSchema as any;
    expect(s.required).toEqual(['selection', 'tag']);
    expect(s.properties.tag.type).toBe('string');
    const branches = s.properties.selection.anyOf;
    expect(branches.at(-1)).toEqual({ type: 'null' }); // optional at the top: or null
    const query = branches.find((b: any) => b.properties?.kind?.const === 'query');
    expect(query.additionalProperties).toBe(false);
    expect(query.required).toEqual(['kind', 'search', 'expectedCount']);
    expect(query.properties.search.type).toEqual(['string', 'null']);
  });

  it('strict mode flags an open record instead of closing it', () => {
    const cmd = defineCommand({
      id: 'app.t.strictRecord',
      title: 'strict record',
      params: z.object({ query: z.record(z.string(), z.unknown()) }),
      execute: () => ok(undefined as void),
    });
    const env = toJsonSchema(cmd, { strict: true });
    expect((env.warnings ?? []).join(' ')).toMatch(/open record/);
  });

  it('fromStrictArgs turns strict "left out" nulls back into absent keys (so .optional() accepts them)', async () => {
    const { fromStrictArgs } = await import('./schema-bridge.js');
    const params = z.object({ tag: z.string(), note: z.string().optional(), sel: z.object({ ids: z.array(z.string()), n: z.number().optional() }).optional() });
    const strictCall = { tag: 'x', note: null, sel: { ids: ['a'], n: null } };
    expect(params.safeParse(strictCall).success).toBe(false);
    expect(params.safeParse(fromStrictArgs(strictCall)).data).toEqual({ tag: 'x', sel: { ids: ['a'] } });
  });

  it('strict: discriminated unions become anyOf, recursive $defs are walked, optional enums allow null (#97 review)', () => {
    type Node = { name: string; kids?: Node[] };
    const Node: z.ZodType<Node> = z.lazy(() => z.object({ name: z.string(), kids: z.array(Node).optional() }));
    const cmd = defineCommand({
      id: 'app.t.strictMore',
      title: 'strict more',
      params: z.object({
        sel: z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), n: z.number() }), z.object({ kind: z.literal('b') })]),
        color: z.enum(['red', 'blue']).optional(),
        tree: Node,
      }),
      execute: () => ok(undefined as void),
    });
    const s = toJsonSchema(cmd, { strict: true }).inputSchema as any;
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/"oneOf"/);
    expect(s.properties.sel.anyOf).toHaveLength(2);
    expect(s.properties.color.enum).toContain(null);
    // every object anywhere (definitions included) lists all its keys and is closed
    const objects: any[] = [];
    const walk = (x: any) => { if (x && typeof x === 'object') { if (x.properties) objects.push(x); Object.values(x).forEach(walk); } };
    walk(s);
    for (const o of objects) {
      expect(o.required).toEqual(Object.keys(o.properties));
      expect(o.additionalProperties).toBe(false);
    }
  });

  it('strict: a root union and a catchall are flagged', () => {
    const env = toJsonSchema({ id: 'x', title: 'x', params: z.object({ a: z.string() }).catchall(z.number()), execute: () => ok(undefined) } as never, { strict: true });
    expect((env.warnings ?? []).join(' ')).toMatch(/catchall/);
  });

  it('fromStrictArgs with the params keeps a real null and drops a left-out one', async () => {
    const { fromStrictArgs } = await import('./schema-bridge.js');
    const params = z.object({ note: z.string().nullable(), tag: z.string().optional(), items: z.array(z.object({ x: z.number().optional() })) });
    const call = { note: null, tag: null, items: [{ x: null }] };
    expect(fromStrictArgs(call, params)).toEqual({ note: null, items: [{}] });
    expect(params.safeParse(fromStrictArgs(call, params)).success).toBe(true);
  });
});
