#!/usr/bin/env node
/**
 * Repoint `packages/forms-rjsf`'s dev tree at the 5.x half of its DECLARED
 * `@rjsf` peer range, so CI can typecheck and test the adapter against the
 * older major it promises to support (thorwhalen/acture#57).
 *
 * This is a second *install*, not a second alias tree. The three `@rjsf`
 * devDependencies are rewritten to the 5.x clause of the peer range and
 * `@rjsf/shadcn` (published on the 6.x line only) is dropped; a plain
 * `pnpm install` then resolves a plain 5.x tree. No `npm:` aliases and no
 * `packageExtensions` are involved, so pnpm's peers-are-matched-by-package-name
 * behaviour — which is what makes an *aliased* 5.x install useless, since the
 * alias still binds the 6.x `@rjsf/utils` — never comes into play.
 *
 * The 5.x clause is READ from `peerDependencies`, never hardcoded: narrow the
 * published range to 6-only and this script no-ops instead of failing, so the
 * matrix retires itself together with the promise it exists to check.
 *
 *   node scripts/pin-rjsf-5x.mjs            # rewrite the tree (CI only)
 *   node scripts/pin-rjsf-5x.mjs --verify   # after install: assert 5.x resolved
 *
 * DESTRUCTIVE: rewrites `packages/forms-rjsf/package.json` and deletes
 * `src/shadcn-theme.test.tsx` in the working tree. Intended for a throwaway CI
 * checkout; refuses to run outside CI unless `--force` is passed.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = resolve(repoRoot, 'packages/forms-rjsf');
const pkgPath = resolve(pkgDir, 'package.json');

/** The three `@rjsf` packages this adapter peers on and dev-installs. */
const RJSF_DEV_DEPS = ['@rjsf/core', '@rjsf/utils', '@rjsf/validator-ajv8'];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The `^5.x` clause of the declared `@rjsf/core` peer range, or `null`. */
function fiveClause(pkg) {
  const declared = pkg.peerDependencies['@rjsf/core'];
  return (
    declared
      .split('||')
      .map((clause) => clause.trim())
      .find((clause) => /^\D*5\./.test(clause)) ?? null
  );
}

const verify = process.argv.includes('--verify');
const pkg = readJson(pkgPath);
const clause = fiveClause(pkg);

if (!clause) {
  console.log(
    `pin-rjsf-5x: the declared @rjsf/core peer range is ` +
      `"${pkg.peerDependencies['@rjsf/core']}", which has no 5.x clause. ` +
      'Nothing to check — skipping.',
  );
  process.exit(0);
}

if (verify) {
  // A job that silently tests the wrong major is the failure this whole matrix
  // exists to prevent, so the install is checked rather than assumed.
  const installed = readJson(resolve(pkgDir, 'node_modules/@rjsf/core/package.json')).version;
  const major = installed.split('.')[0];
  if (major !== '5') {
    console.error(
      `pin-rjsf-5x --verify: declared range promises "${clause}" but the tree ` +
        `resolved @rjsf/core@${installed}. This job is not testing 5.x.`,
    );
    process.exit(1);
  }
  console.log(`pin-rjsf-5x --verify: @rjsf/core@${installed} — a real 5.x tree.`);
  process.exit(0);
}

if (!process.env.CI && !process.argv.includes('--force')) {
  console.error(
    'pin-rjsf-5x: refusing to rewrite the working tree outside CI. ' +
      'Pass --force if you mean it (and expect to `git checkout` afterwards).',
  );
  process.exit(1);
}

for (const name of RJSF_DEV_DEPS) pkg.devDependencies[name] = clause;
// `@rjsf/shadcn` is 6.x-only; its smoke test is the one thing that cannot run here.
delete pkg.devDependencies['@rjsf/shadcn'];
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const shadcnTest = resolve(pkgDir, 'src/shadcn-theme.test.tsx');
if (existsSync(shadcnTest)) rmSync(shadcnTest);

console.log(
  `pin-rjsf-5x: pinned ${RJSF_DEV_DEPS.join(', ')} to "${clause}", ` +
    'dropped @rjsf/shadcn and its smoke test.',
);
