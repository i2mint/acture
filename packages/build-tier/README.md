# @acture/build-tier

Build-step plugin. Scans `.ts` / `.tsx` source for JSDoc tier tags on `defineCommand` calls and mirrors them into the runtime command's `tier` metadata field.

## Install

```bash
pnpm add -D @acture/build-tier
```

## tsup / esbuild

```ts
// tsup.config.ts
import { defineConfig } from 'tsup';
import { actureBuildTier } from '@acture/build-tier/esbuild';

export default defineConfig({
  entry: ['src/index.ts'],
  esbuildPlugins: [actureBuildTier()],
});
```

## Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { actureBuildTierVite } from '@acture/build-tier/vite';

export default defineConfig({
  plugins: [actureBuildTierVite()],
});
```

## What it does

```ts
/**
 * Search users by email or display name.
 * @stable
 */
export const searchUsers = defineCommand({
  id: 'app.users.search',
  title: 'Search Users',
  execute: async (params) => { /* ... */ },
});
```

becomes (effectively):

```ts
export const searchUsers = defineCommand({
  tier: "stable",
  id: 'app.users.search',
  title: 'Search Users',
  execute: async (params) => { /* ... */ },
});
```

Four tags recognized:

- `@stable` — `tier: 'stable'`
- `@experimental` — `tier: 'experimental'`
- `@deprecated [reason]` — `tier: 'deprecated'` plus `deprecationReason: '<reason>'`
- `@internal` — `tier: 'internal'` plus `internalToken: <module-scoped Symbol>`

Precedence (most-restrictive wins): `@internal` > `@deprecated` > `@experimental` > `@stable`.

The plugin is **idempotent**: if a spec already declares `tier:` explicitly, the JSDoc is ignored. So you can mix hand-written and tag-driven tiers without conflict.

## `@internal` enforcement

For each file containing at least one `@internal` command, the plugin injects a per-file module-scoped Symbol:

```ts
const __actureInternalToken__ = /* @__PURE__ */ Symbol('acture.internal');
```

Each `@internal` command's `internalToken` field references this Symbol. The runtime registry rejects `dispatch` calls from outside the module (i.e., from any caller that didn't capture the Symbol at module load). See [`acture-tier-system`](../../.claude/skills/acture-tier-system/SKILL.md) §7.5.

## Caveats

- Regex-based, not AST. The common case is recognized; exotic JSDoc-or-call shapes are silently ignored (the user's spec keeps its hand-written `tier`, defaulting to `'stable'`).
- 4000-char per-call lookahead window for the matching-brace scan. Real specs are O(20 lines); this is comfortably generous.
- No `.d.ts` mirror — the JSDoc tag survives into `.d.ts` natively (IDE hover shows it), but the resolved `tier` value lives in the JS runtime output only.
