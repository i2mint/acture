---
name: acture-tier-system
description: Load context on acture's API tier system (per research-5) — @stable / @experimental / @internal / @deprecated JSDoc tags, the build-step mirror to the `tier` metadata field, per-tier (not per-feature) runtime opt-in, and the `acture compare-schemas` CLI with description-changes-as-MAJOR-by-default. Use when working on the tier-enforcement build step, the runtime gating in registry.toMCPServer/toAITools, the deprecation banner prefixing, the @internal symbol-token enforcement, the schema diff CLI, or when reviewing API stability commitments. Triggers on "tier system", "stable", "experimental", "internal", "deprecated", "compare-schemas", "schema versioning", "breaking change", "JSDoc tag", "API stability", "@stable", "MCP tool versioning", "SEP-1575".
---

# acture tier system

Loads research-5's findings on schema versioning and API stability for AI/MCP tool surfaces.

## The state of the field (research-5 §2)

MCP has **no established tool-versioning convention as of mid-2026.** The protocol versions itself by date string (`2025-06-18`, `2025-11-25`). Two SEPs are in flight (SEP-1400 protocol semver, SEP-1575 tool versioning). The only production diff tool is community v0.1 (`mcpdiff`/`@mcp-contracts/cli`).

**The space is wide open.** Acture is not late — it can shape what "good" looks like.

## The tier system shape (research-5 §7)

**Authoritative source:** JSDoc tag on the `defineCommand` call site.

```ts
/**
 * Search users by email or display name.
 * @stable
 */
export const searchUsers = defineCommand({
  id: 'app.users.search',
  title: 'Search Users',
  description: 'Search users by email or display name.',
  params: z.object({ query: z.string().min(1) }),
  // tier: 'stable' — derived from @stable JSDoc by the build step
  execute: async ({ query }) => { /* ... */ }
});
```

**Build step mirrors the tag** into the command's `tier` metadata field so the runtime can read it without parsing JSDoc.

## Why JSDoc-tag-plus-mirror (not decorators, not metadata-only)

- **Pure decorators** require `experimentalDecorators` or new TC39 syntax; lose info when transpiled by some toolchains; don't appear in `.d.ts` consumer docs.
- **Pure metadata field** is easy to miss in code review; doesn't render in IDE hover.
- **JSDoc tags** survive into `.d.ts`, render in VS Code IntelliSense, are the convention TypeScript itself uses for `@deprecated` (strikethrough), and api-extractor recognizes `@internal` natively.

The build step is one tsup/esbuild plugin. Users normally only write the tag.

## Per-tier opt-in (not per-feature)

```ts
const mcpServer = registry.toMCPServer();                                  // default: stable only
const devServer = registry.toMCPServer({ tiers: ['stable', 'experimental'] });
const compatServer = registry.toMCPServer({ tiers: ['stable', 'deprecated'] });
registry.toAITools({ tiers: ['stable'] });
registry.toPaletteCommands({ tiers: ['stable', 'experimental'] });        // dev builds
```

**Per-tier**, not per-feature. The explicit deviation from VS Code's `enabledApiProposals`. VS Code's per-feature opt-in is what its maintainers describe as the friction preventing external publishing: "you cannot publish an extension that uses a proposed API." Acture's target user is a small team that will not maintain a `proposed-apis.json`.

## What `@experimental` does at runtime

- NOT in `tools/list` by default.
- Appears only when server constructed with `tiers: ['stable', 'experimental']`. Opt-in is a server-construction option, NOT a per-request header (the MCP spec does not yet support per-request tier negotiation).
- On first dispatch when `enableTierWarnings(registry)` is wired up: `console.warn(...)` once per command per process. Suppressible via `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1` env var, or by passing `enabled: false` to `enableTierWarnings`. Implemented in `packages/core/src/tier-warnings.ts`. Not automatic — the host must opt in by calling `enableTierWarnings(registry)` once at app boot.
- Graduation: removing `@experimental` + adding `@stable` is a **MINOR** change (pure expansion of the default surface).

## What `@deprecated` does at runtime

- Stays in `tools/list` by default for **one minor release** after the tag is added.
- The description LLMs see is rewritten: `"[DEPRECATED — use {Y} instead] {original description}"`. Prepending is deterministic so downstream diffs detect deprecation-banner-only changes and skip flagging them as breaking.
- `@deprecated <reason text>` is parsed; text after the tag becomes the banner reason.
- One minor release after deprecation, the command is filtered from `tools/list` by default. Still callable from same-package code so internal migrations can complete.
- Removing a `@deprecated` command from the codebase is a **MAJOR** change.

## What `@internal` does (three layers)

1. **Build-time** — never projected to MCP / AI / palette / OpenAPI surfaces. `registry.toMCPServer()` filters internal commands unconditionally regardless of `tiers` option.
2. **TypeScript declarations** — `--stripInternal` recognized by `tsc`; api-extractor recognizes it. Consumer packages built with `tsc --stripInternal` don't have `.d.ts` entries for internal commands.
3. **Runtime** — dispatching `@internal` from outside the package emits `console.error` and throws in development; throws unconditionally in production. Cross-package check uses a module-scoped `Symbol('acture.internal')` token attached to the registry — internal commands callable only when the caller is registered with the same token (only same-package code receives it because the token is module-scoped and not re-exported).

Module-level closure plus symbol-keyed access is the closest TypeScript gets to Java's `package` keyword. Not airtight against `eval`-based attackers, but adequate for the "don't accidentally expose this in tools/list" threat model.

## `acture compare-schemas` CLI (research-5 §6)

```bash
acture compare-schemas <base> [<head>]    # base/head are paths to snapshot JSON files OR git refs
acture compare-schemas --fail-on major    # CI gate
acture compare-schemas --format json      # machine output
acture compare-schemas --allow-description-edits  # per-invocation, NOT a config setting
acture compare-schemas --snapshot-path .acture/snapshot.json  # when args are git refs
```

Lives in `packages/cli/` (`@acture/cli`). Reads two pre-rendered snapshots and diffs them. The snapshot is produced by `snapshotRegistry(registry)` (programmatic) or by `acture snapshot <config>` (CLI subcommand, v1.1+):

```bash
acture snapshot ./registry.mjs --out .acture/snapshot.json    # write to file
acture snapshot ./registry.mjs                                # write to stdout
acture snapshot ./registry.mjs --tiers stable,experimental    # filter tiers
```

For `.ts` configs the user runs Node ≥22.6 with `--experimental-strip-types`, or uses `tsx node_modules/.bin/acture snapshot ./registry.ts`. Field-level diff is shallow (top-level `properties` and one level of `enum`/`type`); deep-object diff is a v1.2 polish.

## Change classifications (research-5 §6.1)

| Change | Default severity |
| --- | --- |
| Command removed | MAJOR |
| Command renamed (detected via stable ID) | MAJOR |
| Input field removed | MAJOR |
| Input field type narrowed | MAJOR |
| Input field made required | MAJOR |
| Enum value removed | MAJOR (`x-extensible-enum` opt-out supported) |
| Output field removed or type changed | MAJOR |
| New required input field | MAJOR |
| New optional input field | MINOR |
| **Description text changed** | **MAJOR** (see below) |
| `when` predicate narrowed | MAJOR |
| `when` predicate broadened | MINOR |
| Alias removed/renamed | MAJOR |
| Tier downgrade (stable → experimental) | MAJOR |
| Tier upgrade (experimental → stable) | MINOR |
| `@deprecated` added | MINOR (plus warning) |
| Enum value added | MINOR |

## The description-change call: MAJOR by default

Per research-5 §6.2. The decisive consideration is the **audience for the warning**:
- If `compare-schemas` runs against `HEAD` during a feature branch, developer expects to see description changes; dismissing is a one-flag operation.
- If `compare-schemas` runs against the last released tag at publish time, missing a description change is a silent regression with no recovery once the model has memorized the new phrasing.

**Cost of false negatives at publish time > cost of false positives at branch time.** Resolves to MAJOR-by-default with branch-level relaxation:

```bash
acture compare-schemas --against v1.4.0 --fail-on major          # in CI, gating release
acture compare-schemas --against main --allow-description-edits  # in feature branch
```

`--allow-description-edits` is **per-invocation, NOT a config file setting** — that would let teams turn it on globally and forget it. Same discipline `buf` enforces.

## Why descriptions matter

Anthropic's engineering blog [research-5 ref 5]: "Claude Sonnet 3.5 achieved state-of-the-art performance on SWE-bench Verified after we made precise refinements to tool descriptions, dramatically reducing error rates."

**Tool descriptions are prompts, not documentation.** Small description regressions can drive equivalent breakage in user agents.

## Migration points: internal → external (research-5 §8)

When an acture user takes the "expose your app to third-party MCP clients" step, the v1 simplifications become liabilities. Document these:

1. **No per-tool semver → per-tool `version` metadata.** Once SEP-1575 lands, add a `version` field. Until then, tools inherit consumer-package version.
2. **`--allow-description-edits` is dev-only.** External publishers should run `compare-schemas --against $(latest_release_tag)` with no description escape.
3. **Publish an `acture.json` companion artifact** (analogous to `openapi.json`) documenting which commands are stable / experimental / deprecated. Follow Cloudflare and Vercel's `llms.txt` pattern.
4. **No `_v1` suffixes.** Per MCP Issue #1915, the community is converging on stable names + separate version fields. Adopting `_v2` suffixes early can't be unwound.
5. **Default diff baseline: working tree → last released git tag** in `--release-mode`.
6. **`console.warn` → structured logging.** External operators want JSON.

## What NOT to do

- **Do not adopt VS Code's per-feature opt-in.** It is the friction VS Code maintainers themselves describe as preventing external publishing.
- **Do not put `--allow-description-edits` in `.acturerc`.** Per-invocation only.
- **Do not encode tool versions in the name (`get_info_v1`).** Stable name; separate version field when SEP-1575 lands.
- **Do not skip the banner prepending for `@deprecated`.** The model sees the description; it must see the deprecation.

## See also

- `docs/research/acture_research_5 -- Schema Versioning ...md` — the source
- `acture-command-record-shape` — `tier` field spec
- `acture-schema-bridge` — how `compare-schemas` walks the registry
