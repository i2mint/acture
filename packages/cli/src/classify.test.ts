import { describe, it, expect } from 'vitest';
import { classifyChanges } from './classify.js';
import type { Snapshot } from './snapshot.js';

function snap(...tools: Snapshot['tools']): Snapshot {
  return { version: 1, generator: 'test', tools };
}

function tool(name: string, overrides: Partial<Snapshot['tools'][number]> = {}): Snapshot['tools'][number] {
  return {
    name,
    description: 'desc',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    tier: 'stable',
    deprecationReason: null,
    aliases: [],
    when: null,
    ...overrides,
  };
}

describe('classifyChanges', () => {
  it('classifies a removed command as MAJOR', () => {
    const base = snap(tool('app.gone'), tool('app.kept'));
    const head = snap(tool('app.kept'));
    const result = classifyChanges(base, head);
    expect(result.maxSeverity).toBe('major');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.kind).toBe('command-removed');
  });

  it('classifies a new command as MINOR', () => {
    const base = snap(tool('app.a'));
    const head = snap(tool('app.a'), tool('app.b'));
    const result = classifyChanges(base, head);
    expect(result.maxSeverity).toBe('minor');
    expect(result.changes[0]!.kind).toBe('command-added');
  });

  it('classifies a description change as MAJOR by default', () => {
    const base = snap(tool('app.a', { description: 'Old.' }));
    const head = snap(tool('app.a', { description: 'New.' }));
    const result = classifyChanges(base, head);
    expect(result.maxSeverity).toBe('major');
    expect(result.changes[0]!.kind).toBe('description-changed');
  });

  it('downgrades description changes to MINOR with --allow-description-edits', () => {
    const base = snap(tool('app.a', { description: 'Old.' }));
    const head = snap(tool('app.a', { description: 'New.' }));
    const result = classifyChanges(base, head, { allowDescriptionEdits: true });
    expect(result.maxSeverity).toBe('minor');
    expect(result.changes[0]!.severity).toBe('minor');
  });

  it('still flags structural changes as MAJOR even with --allow-description-edits', () => {
    const base = snap(
      tool('app.a', {
        description: 'Old.',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      }),
    );
    const head = snap(
      tool('app.a', {
        description: 'New.',
        inputSchema: { type: 'object', properties: {} },
      }),
    );
    const result = classifyChanges(base, head, { allowDescriptionEdits: true });
    expect(result.maxSeverity).toBe('major');
    const kinds = result.changes.map((c) => c.kind).sort();
    expect(kinds).toEqual(['description-changed', 'input-field-removed']);
  });

  it('strips [DEPRECATED — reason] banner from description before comparing', () => {
    const base = snap(tool('app.a', { description: 'Original.' }));
    const head = snap(
      tool('app.a', {
        description: '[DEPRECATED — use app.b instead] Original.',
        tier: 'deprecated',
        deprecationReason: 'use app.b instead',
      }),
    );
    const result = classifyChanges(base, head);
    // Tier transition should fire as `deprecated-added` (MINOR), and the
    // description-with-banner-stripped is unchanged so no
    // description-changed event.
    const kinds = result.changes.map((c) => c.kind);
    expect(kinds).toContain('deprecated-added');
    expect(kinds).not.toContain('description-changed');
  });

  it('classifies a new required field as MAJOR', () => {
    const base = snap(tool('app.a', { inputSchema: { type: 'object', properties: {}, required: [] } }));
    const head = snap(
      tool('app.a', {
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        },
      }),
    );
    const result = classifyChanges(base, head);
    expect(result.maxSeverity).toBe('major');
    expect(result.changes.some((c) => c.kind === 'input-field-added-required')).toBe(true);
  });

  it('classifies a new optional field as MINOR', () => {
    const base = snap(tool('app.a', { inputSchema: { type: 'object', properties: {} } }));
    const head = snap(
      tool('app.a', { inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }),
    );
    const result = classifyChanges(base, head);
    expect(result.maxSeverity).toBe('minor');
    expect(result.changes[0]!.kind).toBe('input-field-added-optional');
  });

  it('classifies field becoming required as MAJOR', () => {
    const base = snap(
      tool('app.a', {
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: [],
        },
      }),
    );
    const head = snap(
      tool('app.a', {
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        },
      }),
    );
    const result = classifyChanges(base, head);
    expect(result.changes.some((c) => c.kind === 'input-field-required-tightened')).toBe(true);
    expect(result.maxSeverity).toBe('major');
  });

  it('classifies field type narrowing as MAJOR', () => {
    const base = snap(
      tool('app.a', {
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      }),
    );
    const head = snap(
      tool('app.a', {
        inputSchema: { type: 'object', properties: { q: { type: 'number' } } },
      }),
    );
    const result = classifyChanges(base, head);
    expect(result.changes.some((c) => c.kind === 'input-field-type-narrowed')).toBe(true);
  });

  it('classifies enum value removal as MAJOR, addition as MINOR', () => {
    const base = snap(
      tool('app.a', {
        inputSchema: {
          type: 'object',
          properties: { color: { type: 'string', enum: ['red', 'green', 'blue'] } },
        },
      }),
    );
    const head = snap(
      tool('app.a', {
        inputSchema: {
          type: 'object',
          properties: { color: { type: 'string', enum: ['green', 'blue', 'yellow'] } },
        },
      }),
    );
    const result = classifyChanges(base, head);
    expect(result.changes.some((c) => c.kind === 'enum-value-removed')).toBe(true);
    expect(result.changes.some((c) => c.kind === 'enum-value-added')).toBe(true);
    expect(result.maxSeverity).toBe('major');
  });

  it('classifies tier downgrade stable → experimental as MAJOR', () => {
    const base = snap(tool('app.a', { tier: 'stable' }));
    const head = snap(tool('app.a', { tier: 'experimental' }));
    const result = classifyChanges(base, head);
    expect(result.changes[0]!.kind).toBe('tier-downgraded');
    expect(result.maxSeverity).toBe('major');
  });

  it('classifies tier upgrade experimental → stable as MINOR', () => {
    const base = snap(tool('app.a', { tier: 'experimental' }));
    const head = snap(tool('app.a', { tier: 'stable' }));
    const result = classifyChanges(base, head);
    expect(result.changes[0]!.kind).toBe('tier-upgraded');
    expect(result.maxSeverity).toBe('minor');
  });

  it('classifies removed alias as MAJOR', () => {
    const base = snap(tool('app.a', { aliases: ['foo', 'bar'] }));
    const head = snap(tool('app.a', { aliases: ['foo'] }));
    const result = classifyChanges(base, head);
    expect(result.changes[0]!.kind).toBe('alias-removed');
    expect(result.maxSeverity).toBe('major');
  });

  it('returns none for identical snapshots', () => {
    const t = tool('app.a');
    const result = classifyChanges(snap(t), snap(t));
    expect(result.maxSeverity).toBe('none');
    expect(result.changes).toHaveLength(0);
  });
});
