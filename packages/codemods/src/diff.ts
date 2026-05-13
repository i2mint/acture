/**
 * Minimal unified-diff producer for the CLI's text output.
 *
 * We don't depend on a diff library — agents reading our output just need
 * "before/after blocks with a couple of context lines" and the JSON path
 * for parsing. A real `diff` tool is one-liner away if a user wants it.
 *
 * The format is a simple two-block emission, not a true unified diff
 * patch. The CLI prints the FULL file before-and-after only when the
 * file is small (< 80 lines); for larger files it shows only the line
 * ranges that changed, with `±5` context lines, to keep terminals
 * readable. The JSON output is unaffected.
 */

import type { FileChange } from './types.js';

const CONTEXT_LINES = 5;
const SMALL_FILE_LIMIT = 80;

export function formatFileChangeText(change: FileChange): string {
  if (!change.changed) {
    return `--- ${change.path} (unchanged)`;
  }
  const beforeLines = change.before.split('\n');
  const afterLines = change.after.split('\n');

  if (beforeLines.length <= SMALL_FILE_LIMIT && afterLines.length <= SMALL_FILE_LIMIT) {
    return [
      `--- ${change.path} (before)`,
      ...beforeLines.map((l) => `- ${l}`),
      `+++ ${change.path} (after)`,
      ...afterLines.map((l) => `+ ${l}`),
    ].join('\n');
  }

  const hunks = computeHunks(beforeLines, afterLines);
  if (hunks.length === 0) {
    return `--- ${change.path} (changed; no diff lines extracted)`;
  }
  return hunks
    .map((h) => {
      const ctxBefore = beforeLines.slice(
        Math.max(0, h.beforeStart - CONTEXT_LINES),
        h.beforeStart,
      );
      const ctxAfter = afterLines.slice(
        h.afterEnd,
        h.afterEnd + CONTEXT_LINES,
      );
      return [
        `--- ${change.path} @@ before:${h.beforeStart + 1}-${h.beforeEnd} after:${h.afterStart + 1}-${h.afterEnd}`,
        ...ctxBefore.map((l) => `  ${l}`),
        ...beforeLines.slice(h.beforeStart, h.beforeEnd).map((l) => `- ${l}`),
        ...afterLines.slice(h.afterStart, h.afterEnd).map((l) => `+ ${l}`),
        ...ctxAfter.map((l) => `  ${l}`),
      ].join('\n');
    })
    .join('\n\n');
}

interface Hunk {
  readonly beforeStart: number;
  readonly beforeEnd: number;
  readonly afterStart: number;
  readonly afterEnd: number;
}

function computeHunks(before: readonly string[], after: readonly string[]): Hunk[] {
  // Naive: skip common prefix and common suffix, treat the middle as a
  // single hunk. For the codemods we ship (one-line attribute edits,
  // a few inserted lines for command decls) this is enough to read.
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const beforeStart = prefix;
  const beforeEnd = before.length - suffix;
  const afterStart = prefix;
  const afterEnd = after.length - suffix;
  if (beforeStart === beforeEnd && afterStart === afterEnd) return [];
  return [{ beforeStart, beforeEnd, afterStart, afterEnd }];
}
