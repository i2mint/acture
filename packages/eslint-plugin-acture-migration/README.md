# eslint-plugin-acture-migration

> **acture is a development tool first.** This is dev/build-time tooling — it never becomes a runtime dependency of the apps it serves, and using it is entirely optional. See [`docs/positioning.md`](../../docs/positioning.md).

One ESLint rule for [acture](https://github.com/thorwhalen/acture) strangler-fig migrations: **catch `wrapMutation` wrappers that have outlived their purpose.**

During a migration you wrap an existing handler with `wrapMutation(...)` so the call site stays unchanged while the command becomes visible to the palette, MCP, and AI surfaces. Once the legacy call sites are gone, the wrapper is dead weight — the command should be authored directly with `defineCommand`. This plugin flags those stale wrappers so they don't accumulate.

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

| Option   | Default              | Description |
| -------- | -------------------- | ----------- |
| `module` | `acture-migration`  | Module that `wrapMutation` is imported from. Override if your codebase re-exports it under its own package name. |

## See also

- `acture-migration` — the runtime adoption surface (`wrapMutation`, `actureMiddleware`, …).
- `acture-codemods` — structural transforms for adopting acture.
- `.claude/skills/migration-graduate/SKILL.md` — the agent workflow for retiring a `wrapMutation` once this rule fires.
