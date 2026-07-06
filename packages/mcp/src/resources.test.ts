import { describe, it, expect } from 'vitest';
import type { Tier } from 'acture';
import {
  buildResourcesList,
  readResource,
  viewIdToUri,
  buildGetStateTool,
  callGetState,
  DEFAULT_RESOURCE_PREFIX,
  DEFAULT_GET_STATE_TOOL_NAME,
  type ResourceView,
  type ViewSource,
} from './resources.js';

/** A minimal in-memory ViewSource mirroring the hand-written ViewRegistry:
 *  list is tier-filtered (internal never listed), read returns the value. */
function makeViews(): ViewSource {
  const state = { selection: ['n1', 'n2'], mode: 'edit' as const };
  const records: ResourceView[] = [
    { id: 'app.selection', description: 'Ids of selected nodes', tier: 'stable' },
    { id: 'app.mode', description: 'Current editor mode', tier: 'stable' },
    { id: 'app.beta', description: 'Experimental view', tier: 'experimental' },
    { id: 'app.debug', description: 'Internal diagnostics', tier: 'internal' },
  ];
  const values: Record<string, () => unknown> = {
    'app.selection': () => state.selection,
    'app.mode': () => state.mode,
    'app.beta': () => ({ beta: true }),
    'app.debug': () => ({ secret: 'never-exposed' }),
  };
  return {
    list({ tiers = ['stable'] } = {}) {
      return records.filter((v) => {
        const t = (v.tier ?? 'stable') as Tier;
        if (t === 'internal') return false; // never listed, even for 'all'
        return tiers === 'all' || tiers.includes(t);
      });
    },
    read(id) {
      // A correct ViewSource enforces the read side, like core's dispatch
      // enforces the write side: internal/secret views return undefined.
      const rec = records.find((r) => r.id === id);
      if (!rec || (rec.tier ?? 'stable') === 'internal') return undefined;
      return values[id]?.();
    },
  };
}

describe('buildResourcesList', () => {
  it('projects stable views by default, as app://state/<id> resources', () => {
    const resources = buildResourcesList(makeViews());
    expect(resources).toEqual([
      {
        uri: 'app://state/app.selection',
        name: 'app.selection',
        description: 'Ids of selected nodes',
        mimeType: 'application/json',
      },
      {
        uri: 'app://state/app.mode',
        name: 'app.mode',
        description: 'Current editor mode',
        mimeType: 'application/json',
      },
    ]);
  });

  it('never exposes internal views (even with tiers: "all")', () => {
    const all = buildResourcesList(makeViews(), { tiers: 'all' });
    expect(all.map((r) => r.name)).not.toContain('app.debug');
    // 'all' still surfaces experimental
    expect(all.map((r) => r.name)).toContain('app.beta');
  });

  it('passes the tier filter through (opt-in experimental)', () => {
    const withBeta = buildResourcesList(makeViews(), { tiers: ['stable', 'experimental'] });
    expect(withBeta.map((r) => r.name)).toEqual(['app.selection', 'app.mode', 'app.beta']);
  });

  it('honours a custom uriPrefix', () => {
    const resources = buildResourcesList(makeViews(), { uriPrefix: 'state://' });
    expect(resources[0]!.uri).toBe('state://app.selection');
  });
});

describe('readResource', () => {
  it('returns JSON contents for a known view, keyed by the requested uri', () => {
    const contents = readResource(makeViews(), 'app://state/app.selection');
    expect(contents).toEqual({
      contents: [
        {
          uri: 'app://state/app.selection',
          mimeType: 'application/json',
          text: JSON.stringify(['n1', 'n2'], null, 2),
        },
      ],
    });
  });

  it('accepts a bare id as well as a full uri', () => {
    const byId = readResource(makeViews(), 'app.mode');
    expect(JSON.parse(byId.contents[0]!.text)).toBe('edit');
  });

  it('reads an unknown / internal view as null (no leak, no throw)', () => {
    // unknown id → null
    expect(readResource(makeViews(), 'app://state/app.nonexistent').contents[0]!.text).toBe('null');
    // internal is never listed AND a correct ViewSource returns undefined from
    // read(), so even a guessed internal uri reads as null — no leak.
    expect(readResource(makeViews(), 'app://state/app.debug').contents[0]!.text).toBe('null');
  });
});

describe('viewIdToUri', () => {
  it('maps an id to its default-prefixed uri', () => {
    expect(viewIdToUri('app.selection')).toBe('app://state/app.selection');
    expect(viewIdToUri('app.selection', 'state://')).toBe('state://app.selection');
    expect(DEFAULT_RESOURCE_PREFIX).toBe('app://state/');
  });
});

describe('buildGetStateTool', () => {
  it('builds a read-only tool advertising the stable view ids', () => {
    const tool = buildGetStateTool(makeViews());
    expect(tool.name).toBe(DEFAULT_GET_STATE_TOOL_NAME);
    expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/); // wire-safe for Anthropic/OpenAI/MCP
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      idempotentHint: true,
    });
    const schema = tool.inputSchema as {
      properties: { view: { enum: string[] } };
      required: string[];
    };
    expect(schema.properties.view.enum).toEqual(['app.selection', 'app.mode']); // internal excluded
    expect(schema.required).toEqual(['view']);
    expect(tool.description).toContain('app.selection');
  });

  it('honours a custom name and tier filter', () => {
    const tool = buildGetStateTool(makeViews(), {
      name: 'read_state',
      tiers: ['stable', 'experimental'],
    });
    expect(tool.name).toBe('read_state');
    const schema = tool.inputSchema as { properties: { view: { enum: string[] } } };
    expect(schema.properties.view.enum).toEqual(['app.selection', 'app.mode', 'app.beta']);
  });
});

describe('callGetState', () => {
  it('reads a known view as JSON content', () => {
    const res = callGetState(makeViews(), { view: 'app.selection' });
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0]!.text)).toEqual(['n1', 'n2']);
  });

  it('reads an unknown / internal view as null (no leak)', () => {
    expect(callGetState(makeViews(), { view: 'app.nope' }).content[0]!.text).toBe('null');
    expect(callGetState(makeViews(), { view: 'app.debug' }).content[0]!.text).toBe('null');
  });

  it('returns errors-as-data for a missing / non-string view', () => {
    const res = callGetState(makeViews(), {});
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0]!.text).code).toBe('invalid_params');
  });
});
