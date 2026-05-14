/**
 * Snapshot format — what `acture compare-schemas` reads on each side
 * of the diff. A snapshot is a JSON document containing one entry per
 * registered command, projected through the schema bridge.
 *
 * Format (v1):
 *
 *   {
 *     "version": 1,
 *     "generator": "acture-cli",
 *     "tools": [
 *       {
 *         "name": "app.search",
 *         "description": "Search the corpus.",
 *         "inputSchema": { ...JSON Schema... },
 *         "tier": "stable",
 *         "deprecationReason": null,
 *         "aliases": [],
 *         "when": null
 *       },
 *       ...
 *     ]
 *   }
 *
 * Users typically produce snapshots from a registry via the
 * `snapshotRegistry(registry)` helper exported here. The CLI's
 * `compare-schemas` subcommand reads two such JSON files (or two refs
 * via `git show <ref>:<path>`) and diffs them.
 */

import type { AnyCommandRecord, Registry } from 'acture';
import { toJsonSchema } from 'acture';

export interface SnapshotTool {
  /** Command id (== MCP tool name). */
  readonly name: string;
  /** Description as the model sees it. May include deprecation banners. */
  readonly description?: string;
  /** Projected JSON Schema input schema. */
  readonly inputSchema: Record<string, unknown>;
  /** Tier as declared on the command, defaulting to 'stable'. */
  readonly tier: 'stable' | 'experimental' | 'internal' | 'deprecated';
  /** Free-text reason from `@deprecated <reason>`. `null` if not deprecated. */
  readonly deprecationReason: string | null;
  /** Aliases (search labels for the palette / MCP clients). */
  readonly aliases: readonly string[];
  /** When-clause as a DSL string, or `"<function>"` if function-form,
   *  or `null` if absent. Function-form when-clauses are NOT comparable
   *  structurally; the classifier treats every change to a function-form
   *  when as MAJOR. */
  readonly when: string | null;
}

export interface Snapshot {
  readonly version: 1;
  readonly generator: string;
  readonly tools: readonly SnapshotTool[];
}

/**
 * Project a live registry into a snapshot. Honours the tier filter the
 * caller is interested in (defaults to `['stable']` — same as the
 * MCP / AI projections).
 */
export function snapshotRegistry(
  registry: Registry,
  options: { tiers?: readonly SnapshotTool['tier'][] | 'all' } = {},
): Snapshot {
  const list = registry.list({ tiers: options.tiers ?? 'all' });
  const tools = list.map(commandToSnapshotTool);
  return {
    version: 1,
    generator: 'acture-cli',
    tools,
  };
}

/** Convert one command to its snapshot form. Exported for testing. */
export function commandToSnapshotTool(cmd: AnyCommandRecord): SnapshotTool {
  const envelope = toJsonSchema(cmd);
  const out: SnapshotTool = {
    name: envelope.name,
    ...(envelope.description !== undefined ? { description: envelope.description } : {}),
    inputSchema: envelope.inputSchema,
    tier: (cmd.tier ?? 'stable') as SnapshotTool['tier'],
    deprecationReason: cmd.deprecationReason ?? null,
    aliases: cmd.aliases ? [...cmd.aliases] : [],
    when:
      cmd.when === undefined
        ? null
        : typeof cmd.when === 'string'
          ? cmd.when
          : '<function>',
  };
  return out;
}

/** Type-narrow a parsed JSON value to a Snapshot, or throw. */
export function parseSnapshot(value: unknown, source: string): Snapshot {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      `${source}: snapshot must be a JSON object, got ${typeof value}`,
    );
  }
  const v = value as Record<string, unknown>;
  if (v['version'] !== 1) {
    throw new Error(
      `${source}: unsupported snapshot version ${String(v['version'])} (expected 1)`,
    );
  }
  if (!Array.isArray(v['tools'])) {
    throw new Error(`${source}: snapshot.tools must be an array`);
  }
  return value as Snapshot;
}
