/**
 * `acture` CLI entry. Subcommands:
 *
 *   acture compare-schemas <base> [<head>] [options]
 *   acture snapshot   (post-v1; placeholder error in v1.0)
 *
 * Options for compare-schemas:
 *   --fail-on <severity>          minor|major (default: never fail)
 *   --allow-description-edits     downgrade description-only diffs to MINOR
 *   --format <text|json>          output format (default: text)
 *   --snapshot-path <path>        ref-relative snapshot path (default: .acture/snapshot.json)
 *   --no-color                    disable ANSI color in text output
 *
 * The parser is hand-rolled. We deliberately avoid commander/yargs to
 * keep the install lean (`npx acture` should be quick) and avoid
 * argument-injection surprises.
 */

import { classifyChanges, type Severity } from './classify.js';
import { formatResult, type OutputFormat } from './format.js';
import { loadSnapshot } from './load.js';
import { runSnapshotCmd } from './snapshot-cmd.js';
import type { SnapshotTool } from './snapshot.js';

const HELP = `acture — typed schema-driven command dispatch

Usage:
  acture compare-schemas <base> [<head>] [options]
  acture snapshot <config> [options]
  acture --help

compare-schemas options:
  --fail-on <severity>         Exit non-zero on this severity or higher (minor|major).
  --allow-description-edits    Downgrade description-only diffs to MINOR (per-invocation).
  --format <text|json>         Output format. Default: text.
  --snapshot-path <path>       Snapshot path when args are git refs. Default: .acture/snapshot.json.
  --no-color                   Disable ANSI color in text output.

snapshot options:
  --out <path>                 Write JSON to this file (default: stdout).
  --tiers <comma-list>         Comma-separated tiers to include (default: all).
                               One of: stable, experimental, deprecated, internal, all.

Examples:
  acture compare-schemas v0.9.0 HEAD
  acture compare-schemas base.json head.json --fail-on major --format json
  acture compare-schemas main --allow-description-edits

  acture snapshot ./registry.mjs --out .acture/snapshot.json
  acture snapshot ./registry.mjs --tiers stable,experimental

Docs: https://github.com/thorwhalen/acture#readme
`;

const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

const subcommand = argv[0];

if (subcommand === 'compare-schemas') {
  runCompareSchemas(argv.slice(1));
} else if (subcommand === 'snapshot') {
  void runSnapshotFromArgs(argv.slice(1));
} else {
  process.stderr.write(`acture: unknown subcommand "${subcommand}"\n\n`);
  process.stderr.write(HELP);
  process.exit(2);
}

async function runSnapshotFromArgs(args: readonly string[]): Promise<void> {
  let config: string | undefined;
  let out: string | undefined;
  let tiers: readonly SnapshotTool['tier'][] | 'all' | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--out') {
      const v = args[++i];
      if (!v) {
        process.stderr.write('acture snapshot: --out requires a value\n');
        process.exit(2);
      }
      out = v;
    } else if (a === '--tiers') {
      const v = args[++i];
      if (!v) {
        process.stderr.write('acture snapshot: --tiers requires a value\n');
        process.exit(2);
      }
      tiers = parseTiersList(v);
    } else if (a.startsWith('--')) {
      process.stderr.write(`acture snapshot: unknown option ${a}\n`);
      process.exit(2);
    } else if (config === undefined) {
      config = a;
    } else {
      process.stderr.write(`acture snapshot: unexpected positional "${a}"\n`);
      process.exit(2);
    }
  }
  if (config === undefined) {
    process.stderr.write('acture snapshot: missing <config> argument\n');
    process.exit(2);
  }
  const code = await runSnapshotCmd({
    config,
    ...(out !== undefined ? { out } : {}),
    ...(tiers !== undefined ? { tiers } : {}),
  });
  process.exit(code);
}

function parseTiersList(s: string): readonly SnapshotTool['tier'][] | 'all' {
  if (s === 'all') return 'all';
  const allowed: ReadonlySet<SnapshotTool['tier']> = new Set([
    'stable',
    'experimental',
    'deprecated',
    'internal',
  ]);
  const out: SnapshotTool['tier'][] = [];
  for (const t of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!allowed.has(t as SnapshotTool['tier'])) {
      process.stderr.write(
        `acture snapshot: invalid tier "${t}" (one of: stable, experimental, deprecated, internal, all)\n`,
      );
      process.exit(2);
    }
    out.push(t as SnapshotTool['tier']);
  }
  return out;
}

interface CompareSchemasArgs {
  base: string;
  head: string;
  failOn?: Severity;
  allowDescriptionEdits: boolean;
  format: OutputFormat;
  snapshotPath?: string;
  color?: boolean;
}

function runCompareSchemas(args: readonly string[]): void {
  let parsed: CompareSchemasArgs;
  try {
    parsed = parseCompareSchemasArgs(args);
  } catch (e) {
    process.stderr.write(`acture compare-schemas: ${(e as Error).message}\n`);
    process.exit(2);
  }
  let baseSnap;
  let headSnap;
  try {
    baseSnap = loadSnapshot(parsed.base, parsed.snapshotPath !== undefined ? { snapshotPath: parsed.snapshotPath } : {});
    headSnap = loadSnapshot(parsed.head, parsed.snapshotPath !== undefined ? { snapshotPath: parsed.snapshotPath } : {});
  } catch (e) {
    process.stderr.write(`acture compare-schemas: ${(e as Error).message}\n`);
    process.exit(2);
  }

  const result = classifyChanges(baseSnap, headSnap, {
    allowDescriptionEdits: parsed.allowDescriptionEdits,
  });

  const output = formatResult(result, parsed.format, parsed.color !== undefined ? { color: parsed.color } : {});
  process.stdout.write(output + '\n');

  if (parsed.failOn !== undefined) {
    const rank: Record<Severity, number> = { none: 0, minor: 1, major: 2 };
    if (rank[result.maxSeverity] >= rank[parsed.failOn]) {
      process.exit(1);
    }
  }
}

function parseCompareSchemasArgs(args: readonly string[]): CompareSchemasArgs {
  let base: string | undefined;
  let head: string | undefined;
  let failOn: Severity | undefined;
  let allowDescriptionEdits = false;
  let format: OutputFormat = 'text';
  let snapshotPath: string | undefined;
  let color: boolean | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--fail-on') {
      const v = args[++i];
      if (v !== 'minor' && v !== 'major') {
        throw new Error('--fail-on must be "minor" or "major"');
      }
      failOn = v;
    } else if (a === '--allow-description-edits') {
      allowDescriptionEdits = true;
    } else if (a === '--format') {
      const v = args[++i];
      if (v !== 'text' && v !== 'json') {
        throw new Error('--format must be "text" or "json"');
      }
      format = v;
    } else if (a === '--snapshot-path') {
      const v = args[++i];
      if (!v) throw new Error('--snapshot-path requires a value');
      snapshotPath = v;
    } else if (a === '--no-color') {
      color = false;
    } else if (a === '--color') {
      color = true;
    } else if (a.startsWith('--')) {
      throw new Error(`unknown option ${a}`);
    } else if (base === undefined) {
      base = a;
    } else if (head === undefined) {
      head = a;
    } else {
      throw new Error(`unexpected positional argument "${a}"`);
    }
  }
  if (base === undefined) throw new Error('missing <base> argument');
  // Default head = working tree at snapshotPath.
  if (head === undefined) head = snapshotPath ?? '.acture/snapshot.json';

  const out: CompareSchemasArgs = {
    base,
    head,
    allowDescriptionEdits,
    format,
  };
  if (failOn !== undefined) out.failOn = failOn;
  if (snapshotPath !== undefined) out.snapshotPath = snapshotPath;
  if (color !== undefined) out.color = color;
  return out;
}
