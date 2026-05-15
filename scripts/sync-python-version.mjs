#!/usr/bin/env node
/**
 * Sync the two version strings that mirror `packages/core/package.json`:
 *
 *   1. `python/acture/__init__.py`'s `__version__` — Hatchling reads
 *      this when building the PyPI distribution, so the single edit
 *      drives the PyPI version.
 *   2. `packages/core/src/index.ts`'s `__version` export — surfaced for
 *      runtime introspection; drifted historically (v1.1.0 → v1.2.1)
 *      because nothing was rewriting it. Now it tracks the package.json
 *      automatically, same way Python does.
 *
 * Run after `pnpm changeset version` (already wired into the
 * `version-packages` script in the repo root `package.json`).
 *
 *   node scripts/sync-python-version.mjs
 *
 * Exits 0 on success (with or without a change), non-zero on parse
 * failure. Stays silent when no change is needed so it can run in CI
 * without log spam.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CORE_PKG = join(REPO, 'packages/core/package.json');
const PY_INIT = join(REPO, 'python/acture/__init__.py');
const TS_INDEX = join(REPO, 'packages/core/src/index.ts');

const corePkg = JSON.parse(readFileSync(CORE_PKG, 'utf8'));
const target = corePkg.version;
if (typeof target !== 'string' || target.length === 0) {
  console.error(`[sync-python-version] could not read version from ${CORE_PKG}`);
  process.exit(1);
}

/**
 * Rewrite a single line of `filePath` matching `pattern` to `replacement`.
 * Returns `true` if the file was modified.
 */
function rewriteOnce(filePath, pattern, replacement, label) {
  const before = readFileSync(filePath, 'utf8');
  if (!pattern.test(before)) {
    console.error(`[sync-python-version] no ${label} assignment found in ${filePath}`);
    process.exit(1);
  }
  const after = before.replace(pattern, replacement);
  if (before === after) return false;
  writeFileSync(filePath, after);
  return true;
}

// Python __version__ — Hatchling reads this for the PyPI build.
if (
  rewriteOnce(
    PY_INIT,
    /__version__\s*=\s*"[^"]*"/,
    `__version__ = "${target}"`,
    '__version__',
  )
) {
  console.log(`[sync-python-version] python/acture/__init__.py → ${target}`);
}

// TS __version — runtime introspection in `packages/core/src/index.ts`.
// Matches `__version = 'x.y.z' as const` or with double quotes.
if (
  rewriteOnce(
    TS_INDEX,
    /__version\s*=\s*['"][^'"]*['"]\s*as\s+const/,
    `__version = '${target}' as const`,
    '__version',
  )
) {
  console.log(`[sync-python-version] packages/core/src/index.ts → ${target}`);
}
