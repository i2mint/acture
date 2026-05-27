import { describe, it, expect } from 'vitest';
import {
  TOOL_NAME_PATTERN,
  TOOL_NAME_MAX_LENGTH,
  commandIdToToolName,
  buildToolNameToIdMap,
} from './tool-name.js';

describe('commandIdToToolName', () => {
  it('replaces dots with underscores (the dotted-id case)', () => {
    expect(commandIdToToolName('app.search.run')).toBe('app_search_run');
    expect(commandIdToToolName('app.corpus.create')).toBe('app_corpus_create');
  });

  it('passes already-safe ids through unchanged (idempotent)', () => {
    for (const safe of ['app', 'app_search', 'app-search', 'A1_b-2', 'x', 'X9']) {
      expect(commandIdToToolName(safe)).toBe(safe);
      expect(commandIdToToolName(commandIdToToolName(safe))).toBe(safe);
    }
  });

  it('output always matches the OpenAI/Anthropic/MCP tool-name regex', () => {
    const inputs = [
      'app.search.run',
      'a.b.c.d.e.f.g',
      'has space',
      'unicode🚀nope',
      'too:many:colons',
    ];
    for (const inp of inputs) {
      const out = commandIdToToolName(inp);
      expect(TOOL_NAME_PATTERN.test(out)).toBe(true);
    }
  });

  it('truncates ids longer than the 64-char limit with a stable suffix', () => {
    const long = 'app.' + 'x'.repeat(200);
    const out = commandIdToToolName(long);
    expect(out.length).toBeLessThanOrEqual(TOOL_NAME_MAX_LENGTH);
    expect(TOOL_NAME_PATTERN.test(out)).toBe(true);
    // Stable: same input → same output every time.
    expect(commandIdToToolName(long)).toBe(out);
    // Distinct long inputs that share a prefix project to distinct names.
    const long2 = long + 'y';
    expect(commandIdToToolName(long2)).not.toBe(out);
  });
});

describe('buildToolNameToIdMap', () => {
  it('inverts commandIdToToolName for a registry-style list of ids', () => {
    const ids = ['app.search.run', 'app.corpus.create', 'simple'];
    const map = buildToolNameToIdMap(ids);
    expect(map['app_search_run']).toBe('app.search.run');
    expect(map['app_corpus_create']).toBe('app.corpus.create');
    expect(map['simple']).toBe('simple');
  });

  it('calls onCollision when two ids project to the same tool name', () => {
    // Two ids that differ only in a forbidden character collide.
    const collisions: Array<[string, string, string]> = [];
    buildToolNameToIdMap(['a.b', 'a_b'], (name, first, second) => {
      collisions.push([name, first, second]);
    });
    expect(collisions).toEqual([['a_b', 'a.b', 'a_b']]);
  });
});
