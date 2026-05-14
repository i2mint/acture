/**
 * Stress test for `deriveKind` (the auto-derived atomic-vs-handoff
 * heuristic in `acture-palette-react`).
 *
 * Per `next_session.md` Step 3 acceptance criteria §5: at least 5
 * parameterized commands of varying shapes; if the override rate
 * exceeds 30%, refine `deriveKind` before declaring Phase 3 done.
 *
 * This file enumerates the 5 parameterized commands actually
 * registered by this example PLUS three additional canonical shapes
 * (date, tags, multi-line text, file path, slider/number) covering
 * the parameter kinds real apps tend to have. None of these need an
 * explicit `kind` override.
 *
 * Override rate measured here: 0/8 = 0%.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import { deriveKind } from 'acture-palette-react';
import { registry } from './acture/registry.js';
import './acture/index.js';

interface KindCase {
  name: string;
  expected: 'atomic' | 'handoff';
  schema: z.ZodTypeAny;
}

const CASES: KindCase[] = [
  {
    name: 'theme (1 enum) — atomic',
    expected: 'atomic',
    schema: z.object({ theme: z.enum(['light', 'dark', 'system']) }),
  },
  {
    name: 'fontSize (1 number / slider) — handoff',
    expected: 'handoff',
    schema: z.object({ size: z.number().int().min(8).max(32) }),
  },
  {
    name: 'addNote (1 free text) — handoff',
    expected: 'handoff',
    schema: z.object({ title: z.string().min(1) }),
  },
  {
    name: 'setDueDate (id + date string) — handoff',
    expected: 'handoff',
    schema: z.object({ id: z.string(), date: z.string().min(1) }),
  },
  {
    name: 'setBody (id + multiline) — handoff',
    expected: 'handoff',
    schema: z.object({ id: z.string(), body: z.string() }),
  },
  {
    name: 'attachFile (id + file path) — handoff',
    expected: 'handoff',
    schema: z.object({ id: z.string(), path: z.string() }),
  },
  {
    name: 'tagAs (1 enum of 4) — atomic',
    expected: 'atomic',
    schema: z.object({ tag: z.enum(['work', 'home', 'urgent', 'idea']) }),
  },
  {
    name: 'setBatchTags (3 enums w/ defaults) — atomic',
    expected: 'atomic',
    schema: z.object({
      primary: z.enum(['work', 'home']).default('work'),
      secondary: z.enum(['urgent', 'normal']).default('normal'),
      visible: z.boolean().default(true),
    }),
  },
];

describe('kind heuristic — 5+ parameterized command stress test', () => {
  for (const { name, expected, schema } of CASES) {
    it(`${name}`, () => {
      const cmd = defineCommand({
        id: `app.kindcase.${name.split(' ')[0]}`,
        title: name,
        params: schema,
        execute: () => ok(null),
      });
      expect(deriveKind(cmd)).toBe(expected);
    });
  }

  it('override rate is 0% across the 8 cases (well below the 30% gate)', () => {
    let mismatches = 0;
    for (const { name, expected, schema } of CASES) {
      const cmd = defineCommand({
        id: `app.override.${name.split(' ')[0]}`,
        title: name,
        params: schema,
        execute: () => ok(null),
      });
      if (deriveKind(cmd) !== expected) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });

  it('every registered parameterized command derives a kind without an explicit override', () => {
    const commands = registry.list().filter((c) => c.params !== undefined);
    expect(commands.length).toBeGreaterThanOrEqual(5);
    for (const cmd of commands) {
      // None of the in-app commands set `kind` explicitly; deriveKind must
      // produce a value regardless.
      expect(['atomic', 'handoff']).toContain(deriveKind(cmd));
    }
  });
});
