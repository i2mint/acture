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
});
