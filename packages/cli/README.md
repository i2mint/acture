# @acture/cli

The `acture` binary. Two subcommands today; the package is intentionally small.

## Install

```bash
pnpm add -D @acture/cli
```

## `acture compare-schemas`

Diff two registry snapshots and classify changes per research-5 §6.1. CI gate.

```bash
# diff two snapshot files
acture compare-schemas base.json head.json

# diff two git refs (reads .acture/snapshot.json from each)
acture compare-schemas v1.0.0 HEAD

# CI gate: exit non-zero on MAJOR
acture compare-schemas v1.0.0 HEAD --fail-on major

# description edits are MAJOR by default (research-5 §6.2);
# allow them at branch time only (NOT a config-file setting):
acture compare-schemas main --allow-description-edits

# machine-readable output
acture compare-schemas base.json head.json --format json
```

Classifications:

| Change | Severity |
| --- | --- |
| Command removed | MAJOR |
| Input field removed / type narrowed / required-tightened | MAJOR |
| New required input field | MAJOR |
| Enum value removed | MAJOR |
| Description changed | MAJOR (downgradable via `--allow-description-edits`) |
| Tier downgrade (stable → experimental) | MAJOR |
| Alias removed / `when` changed | MAJOR |
| New optional input field / enum value added | MINOR |
| New command / tier upgrade / `@deprecated` added | MINOR |

The deprecation banner (`[DEPRECATED — <reason>]`) is stripped before comparing descriptions so the banner addition itself doesn't double-flag.

## `acture snapshot`

Load a registry config and emit a JSON snapshot. Use this to produce the baseline that `compare-schemas` reads.

```bash
# write a snapshot to stdout
acture snapshot ./registry.mjs

# write to a file (creates parent dirs if needed)
acture snapshot ./registry.mjs --out .acture/snapshot.json

# filter tiers (default: all)
acture snapshot ./registry.mjs --tiers stable,experimental
```

The config module must default-export an acture `Registry` (or `Promise<Registry>`):

```js
// registry.mjs
import { createRegistry, defineCommand, ok } from 'acture';
import { buildCommands } from './commands/index.js';

const registry = createRegistry();
registry.registerAll(buildCommands());
export default registry;
```

**TypeScript configs:** Node ≥22.6 with `--experimental-strip-types` works directly. Otherwise:

```bash
npx tsx node_modules/.bin/acture snapshot ./registry.ts --out .acture/snapshot.json
```

## CI recipe

```yaml
# .github/workflows/schema-check.yml
- run: pnpm install
- run: pnpm build
- run: npx acture snapshot ./registry.mjs --out .acture/snapshot.json
- run: npx acture compare-schemas $LAST_RELEASE_TAG HEAD --fail-on major
```

`$LAST_RELEASE_TAG` is `git describe --tags --abbrev=0` or similar. The snapshot at the release tag should be committed alongside the tag so the CLI can read it via `git show $tag:.acture/snapshot.json`.

## Programmatic API

The same building blocks are exported from the package root:

```ts
import {
  snapshotRegistry,
  classifyChanges,
  formatResult,
  runSnapshotCmd,
} from '@acture/cli';
```

See [`docs/research/acture_research_5 -- Schema Versioning ...md`](../../docs/research/) §6 for the canonical design.
