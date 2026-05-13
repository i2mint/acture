/**
 * Output formatters for `acture compare-schemas`. The classifier is
 * machine-readable; this file just translates a result to text or JSON.
 *
 * Text format follows oasdiff's rule-id style — `path | severity |
 * kind | summary` — with optional ANSI colors when stdout is a TTY.
 */

import type { Change, ClassifyResult, Severity } from './classify.js';

export type OutputFormat = 'text' | 'json';

export interface FormatOptions {
  /** Force colors on/off. Default: auto (color if stdout.isTTY). */
  readonly color?: boolean;
}

export function formatResult(
  result: ClassifyResult,
  format: OutputFormat,
  options: FormatOptions = {},
): string {
  if (format === 'json') return formatJson(result);
  return formatText(result, options);
}

function formatJson(result: ClassifyResult): string {
  return JSON.stringify(
    {
      maxSeverity: result.maxSeverity,
      changes: result.changes.map((c) => ({
        tool: c.tool,
        path: c.path,
        kind: c.kind,
        severity: c.severity,
        summary: c.summary,
        details: c.details,
      })),
    },
    null,
    2,
  );
}

function formatText(result: ClassifyResult, options: FormatOptions): string {
  const useColor = options.color ?? defaultColorEnabled();
  const lines: string[] = [];
  if (result.changes.length === 0) {
    lines.push(useColor ? colorize('No schema changes detected.', 'green') : 'No schema changes detected.');
    return lines.join('\n');
  }
  const grouped = groupByTool(result.changes);
  for (const [tool, changes] of grouped) {
    lines.push(useColor ? colorize(`# ${tool}`, 'bold') : `# ${tool}`);
    for (const c of changes) {
      const sevTag = severityTag(c.severity, useColor);
      lines.push(`  ${sevTag} ${c.kind}: ${c.summary}`);
    }
    lines.push('');
  }
  const summary = `Max severity: ${result.maxSeverity}. ${result.changes.length} change(s).`;
  lines.push(useColor ? colorize(summary, result.maxSeverity === 'major' ? 'red' : 'yellow') : summary);
  return lines.join('\n');
}

function groupByTool(changes: readonly Change[]): Array<[string, Change[]]> {
  const groups = new Map<string, Change[]>();
  for (const c of changes) {
    if (!groups.has(c.tool)) groups.set(c.tool, []);
    groups.get(c.tool)!.push(c);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function severityTag(s: Severity, color: boolean): string {
  const label =
    s === 'major' ? '[MAJOR]' : s === 'minor' ? '[MINOR]' : '[NONE]';
  if (!color) return label;
  const c = s === 'major' ? 'red' : s === 'minor' ? 'yellow' : 'green';
  return colorize(label, c);
}

const ANSI: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

function colorize(s: string, c: 'red' | 'green' | 'yellow' | 'bold'): string {
  return `${ANSI[c]}${s}${ANSI['reset']}`;
}

function defaultColorEnabled(): boolean {
  try {
    const proc = (globalThis as { process?: { stdout?: { isTTY?: boolean }; env?: Record<string, string> } }).process;
    if (proc?.env?.['NO_COLOR']) return false;
    return Boolean(proc?.stdout?.isTTY);
  } catch {
    return false;
  }
}
