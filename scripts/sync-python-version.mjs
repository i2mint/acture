#!/usr/bin/env node
/**
 * Sync python/acture/__init__.py's `__version__` to match the npm
 * `acture` package version in packages/core/package.json.
 *
 * Run after `pnpm changeset version` so the Python stub stays in
 * lockstep with the npm release. Hatchling reads `__version__` from the
 * Python source, so this single edit drives the PyPI version too.
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

const corePkg = JSON.parse(readFileSync(CORE_PKG, 'utf8'));
const target = corePkg.version;
if (typeof target !== 'string' || target.length === 0) {
  console.error(`[sync-python-version] could not read version from ${CORE_PKG}`);
  process.exit(1);
}

const before = readFileSync(PY_INIT, 'utf8');
// Match `__version__ = "x.y.z"`; we only rewrite the right-hand string.
const VERSION_LINE = /__version__\s*=\s*"[^"]*"/;
if (!VERSION_LINE.test(before)) {
  console.error(
    `[sync-python-version] no __version__ assignment found in ${PY_INIT}`,
  );
  process.exit(1);
}
const after = before.replace(VERSION_LINE, `__version__ = "${target}"`);
if (before === after) {
  // Already in sync — silent success.
  process.exit(0);
}
writeFileSync(PY_INIT, after);
console.log(`[sync-python-version] python/acture/__init__.py → ${target}`);
