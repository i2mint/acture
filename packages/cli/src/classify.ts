/**
 * Change classifier per research-5 §6.1.
 *
 * Given a base snapshot and a head snapshot, walk every command and
 * every input-field, classifying each change as `none | minor | major`.
 * The output is a flat list of `Change` records; the CLI then formats
 * them as text or JSON and decides exit code based on `--fail-on`.
 *
 * Classification table (default severities):
 *   Command removed                        → MAJOR
 *   Command added (new in head)            → MINOR
 *   Input field removed                    → MAJOR
 *   Input field type changed (narrowed)    → MAJOR
 *   New required input field               → MAJOR
 *   New optional input field               → MINOR
 *   Description text changed               → MAJOR (downgradable to MINOR)
 *   Tier downgrade (stable→experimental)   → MAJOR
 *   Tier upgrade (experimental→stable)     → MINOR
 *   @deprecated added                      → MINOR
 *   Alias removed                          → MAJOR
 *   Alias added                            → MINOR
 *   when-clause changed                    → MAJOR (conservative)
 *   Enum value removed                     → MAJOR
 *   Enum value added                       → MINOR
 */

import type { Snapshot, SnapshotTool } from './snapshot.js';

export type Severity = 'none' | 'minor' | 'major';

export interface Change {
  readonly tool: string;
  readonly path: string;
  readonly kind: ChangeKind;
  readonly severity: Severity;
  readonly summary: string;
  readonly details?: Record<string, unknown>;
}

export type ChangeKind =
  | 'command-removed'
  | 'command-added'
  | 'input-field-removed'
  | 'input-field-added-required'
  | 'input-field-added-optional'
  | 'input-field-required-tightened'
  | 'input-field-type-narrowed'
  | 'description-changed'
  | 'tier-downgraded'
  | 'tier-upgraded'
  | 'deprecated-added'
  | 'alias-removed'
  | 'alias-added'
  | 'when-changed'
  | 'enum-value-removed'
  | 'enum-value-added';

export interface ClassifyOptions {
  /** Downgrade description-only changes from MAJOR to MINOR. Per
   *  research-5 §6.2 this is a per-invocation escape, never global. */
  readonly allowDescriptionEdits?: boolean;
}

export interface ClassifyResult {
  readonly changes: readonly Change[];
  /** Max severity present in `changes`. */
  readonly maxSeverity: Severity;
}

export function classifyChanges(
  base: Snapshot,
  head: Snapshot,
  options: ClassifyOptions = {},
): ClassifyResult {
  const baseByName = indexByName(base.tools);
  const headByName = indexByName(head.tools);
  const allNames = new Set<string>([...baseByName.keys(), ...headByName.keys()]);
  const changes: Change[] = [];

  for (const name of allNames) {
    const b = baseByName.get(name);
    const h = headByName.get(name);
    if (b && !h) {
      changes.push({
        tool: name,
        path: '',
        kind: 'command-removed',
        severity: 'major',
        summary: `Command "${name}" removed`,
      });
      continue;
    }
    if (!b && h) {
      changes.push({
        tool: name,
        path: '',
        kind: 'command-added',
        severity: 'minor',
        summary: `Command "${name}" added`,
      });
      continue;
    }
    if (b && h) diffCommand(b, h, options, changes);
  }

  const maxSeverity: Severity = changes.reduce<Severity>(
    (acc, c) => (severityRank(c.severity) > severityRank(acc) ? c.severity : acc),
    'none',
  );

  return { changes, maxSeverity };
}

function indexByName(tools: readonly SnapshotTool[]): Map<string, SnapshotTool> {
  const out = new Map<string, SnapshotTool>();
  for (const t of tools) out.set(t.name, t);
  return out;
}

function diffCommand(
  base: SnapshotTool,
  head: SnapshotTool,
  options: ClassifyOptions,
  out: Change[],
): void {
  // Tier transitions.
  if (base.tier !== head.tier) {
    if (head.tier === 'deprecated' && base.tier !== 'deprecated') {
      out.push({
        tool: head.name,
        path: 'tier',
        kind: 'deprecated-added',
        severity: 'minor',
        summary: `Command "${head.name}" marked @deprecated`,
        details: { from: base.tier, to: head.tier },
      });
    } else if (severityOfTierTransition(base.tier, head.tier) === 'major') {
      out.push({
        tool: head.name,
        path: 'tier',
        kind: 'tier-downgraded',
        severity: 'major',
        summary: `Command "${head.name}" tier downgraded: ${base.tier} → ${head.tier}`,
        details: { from: base.tier, to: head.tier },
      });
    } else {
      out.push({
        tool: head.name,
        path: 'tier',
        kind: 'tier-upgraded',
        severity: 'minor',
        summary: `Command "${head.name}" tier upgraded: ${base.tier} → ${head.tier}`,
        details: { from: base.tier, to: head.tier },
      });
    }
  }

  // Description. Strip the deterministic `[DEPRECATED ...]` banner
  // before comparing so the addition of the banner doesn't itself
  // register as a description change (the tier transition already did).
  const baseDesc = stripDeprecationBanner(base.description ?? '');
  const headDesc = stripDeprecationBanner(head.description ?? '');
  if (baseDesc !== headDesc) {
    out.push({
      tool: head.name,
      path: 'description',
      kind: 'description-changed',
      severity: options.allowDescriptionEdits ? 'minor' : 'major',
      summary: `Command "${head.name}" description changed`,
      details: { from: baseDesc, to: headDesc },
    });
  }

  // Aliases.
  const baseAliases = new Set(base.aliases);
  const headAliases = new Set(head.aliases);
  for (const a of baseAliases) {
    if (!headAliases.has(a)) {
      out.push({
        tool: head.name,
        path: 'aliases',
        kind: 'alias-removed',
        severity: 'major',
        summary: `Command "${head.name}" alias "${a}" removed`,
      });
    }
  }
  for (const a of headAliases) {
    if (!baseAliases.has(a)) {
      out.push({
        tool: head.name,
        path: 'aliases',
        kind: 'alias-added',
        severity: 'minor',
        summary: `Command "${head.name}" alias "${a}" added`,
      });
    }
  }

  // when-clause. We treat any change as MAJOR conservatively (we don't
  // have a way to detect "broadened" vs "narrowed" without parsing the
  // DSL semantically — research-5 §6.1 calls this out). Function-form
  // when-clauses surface as `"<function>"`.
  if ((base.when ?? null) !== (head.when ?? null)) {
    out.push({
      tool: head.name,
      path: 'when',
      kind: 'when-changed',
      severity: 'major',
      summary: `Command "${head.name}" when-clause changed`,
      details: { from: base.when, to: head.when },
    });
  }

  // Input schema field-level diff — recurses through nested object
  // properties and array `items` per research-5 §6.1.
  diffSchemaObject(head.name, 'inputSchema', base.inputSchema, head.inputSchema, out);
}

/**
 * Walk an object schema's `properties` map and classify per-field
 * changes. Recurses into:
 *   - Nested object schemas (`type: 'object'` with a `properties` map)
 *   - Array item schemas (`type: 'array'` with `items`)
 *
 * `path` is the dotted path *to this schema object*, e.g.
 * `inputSchema.properties.user`. Nested calls extend it.
 *
 * @param toolName  Command name for the change record's `tool` field.
 * @param path      Dotted path to the schema being diffed (used to
 *                  build child paths like `<path>.properties.<key>`).
 * @param base      Base schema object (may be empty).
 * @param head      Head schema object (may be empty).
 * @param out       Collector for emitted changes.
 */
function diffSchemaObject(
  toolName: string,
  path: string,
  base: Record<string, unknown>,
  head: Record<string, unknown>,
  out: Change[],
): void {
  const baseProps = ((base['properties'] ?? {}) as Record<string, unknown>);
  const headProps = ((head['properties'] ?? {}) as Record<string, unknown>);
  const baseRequired = new Set(
    Array.isArray(base['required']) ? base['required'] as string[] : [],
  );
  const headRequired = new Set(
    Array.isArray(head['required']) ? head['required'] as string[] : [],
  );

  const allKeys = new Set([
    ...Object.keys(baseProps),
    ...Object.keys(headProps),
  ]);
  for (const key of allKeys) {
    const b = baseProps[key];
    const h = headProps[key];
    const childPath = `${path}.properties.${key}`;

    if (b !== undefined && h === undefined) {
      out.push({
        tool: toolName,
        path: childPath,
        kind: 'input-field-removed',
        severity: 'major',
        summary: `Command "${toolName}" input field "${childPath}" removed`,
      });
      continue;
    }
    if (b === undefined && h !== undefined) {
      const isRequired = headRequired.has(key);
      out.push({
        tool: toolName,
        path: childPath,
        kind: isRequired
          ? 'input-field-added-required'
          : 'input-field-added-optional',
        severity: isRequired ? 'major' : 'minor',
        summary: `Command "${toolName}" input field "${childPath}" added (${isRequired ? 'required' : 'optional'})`,
      });
      continue;
    }
    if (b !== undefined && h !== undefined) {
      diffSchemaProperty(toolName, childPath, key, baseRequired, headRequired, b, h, out);
    }
  }
}

/** Diff a single property: required-tightening, type narrowing, enums,
 *  and recursion into nested objects / arrays. */
function diffSchemaProperty(
  toolName: string,
  childPath: string,
  key: string,
  baseRequired: ReadonlySet<string>,
  headRequired: ReadonlySet<string>,
  b: unknown,
  h: unknown,
  out: Change[],
): void {
  // Required-tightened: was optional, now required.
  const wasReq = baseRequired.has(key);
  const isReq = headRequired.has(key);
  if (!wasReq && isReq) {
    out.push({
      tool: toolName,
      path: childPath,
      kind: 'input-field-required-tightened',
      severity: 'major',
      summary: `Command "${toolName}" input field "${childPath}" was optional, now required`,
    });
  }
  // Type narrowing — shallow on the `type` key. If it changed, treat
  // ANY change as narrowing for v1 (set-theoretic widening is rare in
  // practice and complex to detect).
  const bType = (b as { type?: unknown }).type;
  const hType = (h as { type?: unknown }).type;
  if (
    bType !== undefined &&
    hType !== undefined &&
    JSON.stringify(bType) !== JSON.stringify(hType)
  ) {
    out.push({
      tool: toolName,
      path: `${childPath}.type`,
      kind: 'input-field-type-narrowed',
      severity: 'major',
      summary: `Command "${toolName}" input field "${childPath}" type changed: ${JSON.stringify(bType)} → ${JSON.stringify(hType)}`,
    });
  }
  // Enum diff.
  const bEnum = (b as { enum?: unknown }).enum;
  const hEnum = (h as { enum?: unknown }).enum;
  if (Array.isArray(bEnum) && Array.isArray(hEnum)) {
    const bSet = new Set(bEnum.map((v) => JSON.stringify(v)));
    const hSet = new Set(hEnum.map((v) => JSON.stringify(v)));
    for (const v of bSet) {
      if (!hSet.has(v)) {
        out.push({
          tool: toolName,
          path: `${childPath}.enum`,
          kind: 'enum-value-removed',
          severity: 'major',
          summary: `Command "${toolName}" enum value ${v} removed from "${childPath}"`,
        });
      }
    }
    for (const v of hSet) {
      if (!bSet.has(v)) {
        out.push({
          tool: toolName,
          path: `${childPath}.enum`,
          kind: 'enum-value-added',
          severity: 'minor',
          summary: `Command "${toolName}" enum value ${v} added to "${childPath}"`,
        });
      }
    }
  }
  // Recurse into nested object schemas. We recurse only when BOTH
  // sides agree the property is an object — a type change is already
  // reported above as a narrow, and recursing across a type swap would
  // double-count its consequences.
  if (
    typeof b === 'object' && b !== null &&
    typeof h === 'object' && h !== null &&
    isObjectSchema(b as Record<string, unknown>) &&
    isObjectSchema(h as Record<string, unknown>)
  ) {
    diffSchemaObject(toolName, childPath, b as Record<string, unknown>, h as Record<string, unknown>, out);
  }
  // Recurse into array item schemas. `items` may itself be an object
  // schema with `properties`, or a plain schema with `type`/`enum`.
  if (
    typeof b === 'object' && b !== null &&
    typeof h === 'object' && h !== null &&
    isArraySchema(b as Record<string, unknown>) &&
    isArraySchema(h as Record<string, unknown>)
  ) {
    const bItems = (b as { items?: unknown }).items;
    const hItems = (h as { items?: unknown }).items;
    if (
      bItems !== undefined && hItems !== undefined &&
      typeof bItems === 'object' && bItems !== null &&
      typeof hItems === 'object' && hItems !== null
    ) {
      const itemsPath = `${childPath}.items`;
      const bRec = bItems as Record<string, unknown>;
      const hRec = hItems as Record<string, unknown>;
      if (isObjectSchema(bRec) && isObjectSchema(hRec)) {
        diffSchemaObject(toolName, itemsPath, bRec, hRec, out);
      } else {
        // Apply the property-level diff to the items schema itself,
        // since arrays of primitives still have `type` / `enum` worth
        // tracking. The `key` here is `items` for required-set lookup
        // (it's never in `required`, but the helper handles that
        // uniformly).
        diffSchemaProperty(
          toolName,
          itemsPath,
          'items',
          EMPTY_SET,
          EMPTY_SET,
          bRec,
          hRec,
          out,
        );
      }
    }
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

function isObjectSchema(s: Record<string, unknown>): boolean {
  return s['type'] === 'object' || s['properties'] !== undefined;
}

function isArraySchema(s: Record<string, unknown>): boolean {
  return s['type'] === 'array' && s['items'] !== undefined;
}

const TIER_RANK: Record<SnapshotTool['tier'], number> = {
  experimental: 0,
  deprecated: 1,
  stable: 2,
  internal: -1,
};

function severityOfTierTransition(
  from: SnapshotTool['tier'],
  to: SnapshotTool['tier'],
): Severity {
  // Internal commands should never appear in snapshots (the registry
  // omits them by default); be defensive.
  if (from === 'internal' || to === 'internal') return 'major';
  if (from === to) return 'none';
  const f = TIER_RANK[from];
  const t = TIER_RANK[to];
  if (t > f) return 'minor';
  return 'major';
}

const SEVERITY_RANK: Record<Severity, number> = { none: 0, minor: 1, major: 2 };
function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

/** Strip the deterministic `[DEPRECATED ...]` banner. Banner formats:
 *
 *   [DEPRECATED] free text
 *   [DEPRECATED — some reason] free text
 *
 * The banner is regenerated at projection time and is not itself a
 * description change. */
function stripDeprecationBanner(s: string): string {
  return s.replace(/^\[DEPRECATED(?:\s+—[^\]]*)?\]\s*/u, '');
}
