# eslint-plugin-acture-migration

> **acture is a development tool first.** This is dev/build-time tooling — it never becomes a runtime dependency of the apps it serves, and using it is entirely optional. See [`docs/positioning.md`](../../docs/positioning.md).

ESLint rules for [acture](https://github.com/i2mint/acture). The package keeps its historical `-migration` suffix (renaming a published package is breaking), but its scope is broader: it hosts both **migration-specific** rules and **schema-quality** rules that apply to any acture codebase.

Current rules:

- [`acture/no-stale-wrap-mutation`](#rule-actureno-stale-wrap-mutation) — *migration:* catch a graduated strangler-fig wrapper that still carries its `wrapMutation` scaffolding.
- [`acture/require-param-describe`](#rule-acturerequire-param-describe) — *schema quality:* require a `.describe(...)` on each top-level field of a `defineCommand` `params: z.object({...})` schema, so the projection to JSON Schema carries a `description` for MCP / AI / form consumers.

## Install

```bash
npm install --save-dev eslint-plugin-acture-migration
```

Requires ESLint 9+ (flat config).

## Usage

```js
// eslint.config.js
import acture from 'eslint-plugin-acture-migration';

export default [
  {
    plugins: { acture },
    rules: {
      'acture/no-stale-wrap-mutation': 'warn',
      'acture/require-param-describe': 'warn',
    },
  },
];
```

Or use the bundled config:

```js
import acture from 'eslint-plugin-acture-migration';

export default [acture.configs.recommended];
```

The `plugins` key is yours to name — `acture` above is just a convention. Whatever you pick becomes the rule's prefix.

---

## Rule: `acture/no-stale-wrap-mutation`

Flags `wrapMutation(...)` calls whose **return value is never used**. The only thing such a call does is the registry-registration side effect — which means the wrapper has graduated: nothing calls the wrapped function anymore.

`wrapMutation`'s whole reason to exist over `defineCommand` is that the call site stays unchanged — the wrapped function is still *called*. When the result is discarded, that property isn't being used, so the wrapper is dead weight.

### Flagged

```ts
import { wrapMutation } from 'acture-migration';

// Bare statement — result discarded entirely.
wrapMutation(handleSave, { registry });

// Assigned to a local binding that is never referenced.
const onSave = wrapMutation(handleSave, { registry });
```

Both should become a direct `defineCommand` plus `registry.register(...)`. See the `migration-graduate` skill.

### Not flagged

```ts
import { wrapMutation } from 'acture-migration';

// Result is used — wrapper is still load-bearing.
const onSave = wrapMutation(handleSave, { registry });
button.addEventListener('click', onSave);

// Result is exported — may be called from another file.
export const onSave = wrapMutation(handleSave, { registry });

// Result is returned or passed onward.
register(wrapMutation(handleSave, { registry }));
```

### Detection contract

The rule is deliberately **single-file and conservative** — research-4's codemod principle: a high-confidence partial signal beats a noisy total one.

- Tracks `wrapMutation` imported (named or aliased) from `acture-migration`. Namespace imports (`import * as m`) are not tracked.
- Reports two shapes: a bare `ExpressionStatement`, and assignment to a non-exported local binding with zero references.
- An exported binding, a referenced binding, a returned result, or a result passed as an argument are all left alone — any of them may still be load-bearing.

False negatives are expected (a binding exported and unused cross-file won't be caught). False positives should be rare; if you hit one, the wrapper result genuinely looks unused in that file.

### Options

```js
'acture/no-stale-wrap-mutation': ['warn', { module: '@myorg/legacy-migration' }]
```

| Option   | Default             | Description |
| -------- | ------------------- | ----------- |
| `module` | `acture-migration` | Module that `wrapMutation` is imported from. Override if your codebase re-exports it under its own package name. |

---

## Rule: `acture/require-param-describe`

Flags top-level fields in a `defineCommand({ params: z.object({...}) })` schema whose value expression has no `.describe('...')` in its method chain. Why this matters: Zod → JSON Schema is lossy. A bare `z.string()` projects to `{ type: 'string' }` — no `description`. Every consumer that reads the projected schema (MCP tool definitions, AI function-calling tool arguments, the autoform / rjsf form adapters) is then handed a parameter with no semantic hint, and a model or a form-renderer cannot know what to put in it. `.describe('...')` carries through to JSON Schema's `description` field. Missing it is a real quality bug, not a style preference. (Surfaced by research-6.)

### Flagged

```ts
import { defineCommand } from 'acture';
import { z } from 'zod';

defineCommand({
  id: 'app.users.search',
  title: 'Search users',
  // ↓ `query` and `limit` will project to JSON Schema with no description.
  params: z.object({
    query: z.string(),
    limit: z.number().int().max(50),
  }),
  execute: (params) => { /* ... */ },
});
```

### Not flagged

```ts
import { defineCommand } from 'acture';
import { z } from 'zod';

defineCommand({
  id: 'app.users.search',
  title: 'Search users',
  params: z.object({
    query: z.string().describe('Email or display-name substring.'),
    limit: z.number().int().max(50).describe('Maximum number of results.'),
  }),
  execute: (params) => { /* ... */ },
});
```

`.describe()` can sit anywhere in the chain — `z.string().describe('...').min(1)` and `z.string().min(1).describe('...')` are both fine.

### Detection contract

Same conservative discipline as the migration rule:

- Tracks `defineCommand` imported (named or aliased) from `acture` (configurable via `actureModule`).
- Tracks `z` named-imported or namespace-imported from `zod` (configurable via `zodModule`).
- Only fires when both bindings are recognised and the `params:` value is structurally `<z>.object({ ... })`. A `params` taken from a variable, `z.discriminatedUnion(...)`, a custom factory, or a namespace-aliased Zod that isn't tracked, is left alone.
- Reports per missing field, with the field's name in the message.
- Top-level fields only — nested `z.object({...})` inner keys are not (yet) walked. A nested object without `.describe()` is flagged at the outer level only.

False negatives are expected (any of the skip cases above); false positives should be rare.

### Options

```js
'acture/require-param-describe': ['warn', {
  actureModule: '@myorg/acture-shim',
  zodModule: 'zod',
}]
```

| Option         | Default   | Description |
| -------------- | --------- | ----------- |
| `actureModule` | `acture` | Module that `defineCommand` is imported from. |
| `zodModule`    | `zod`    | Module that the Zod namespace is imported from. |

---

## See also

- `acture-migration` — the runtime adoption surface (`wrapMutation`, `actureMiddleware`, …).
- `acture-codemods` — structural transforms for adopting acture.
- `acture-schema-bridge` (skill) — what `.describe()` projects through to JSON Schema, and the JSON-Schema-representable subset rule.
- `.claude/skills/migration-graduate/SKILL.md` — the agent workflow for retiring a `wrapMutation` once `no-stale-wrap-mutation` fires.
