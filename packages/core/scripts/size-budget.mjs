#!/usr/bin/env node
/**
 * Check the per-entry byte budgets in `size-budget.json` against the built
 * `dist/`: for each budget, bundle a one-line page that imports the listed
 * names from the entry (esbuild, minified ESM, tree-shaken, zod external)
 * and fail if it exceeds `maxBytes`. Run after `pnpm build`.
 *
 * Usage: node scripts/size-budget.mjs [--json]
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { budgets } = JSON.parse(readFileSync(join(root, 'size-budget.json'), 'utf8'));

function distFile(entry) {
  const sub = entry === pkg.name ? '.' : './' + entry.slice(pkg.name.length + 1);
  const target = pkg.exports?.[sub]?.import;
  if (!target) throw new Error(`size-budget: ${entry} is not an export of ${pkg.name}`);
  return join(root, target);
}

async function measure({ entry, imports }) {
  const contents = `import { ${imports.join(', ')} } from ${JSON.stringify(distFile(entry))};\n` +
    `globalThis.__keep = [${imports.join(', ')}];\n`;
  const out = await build({
    stdin: { contents, resolveDir: root, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    external: ['zod'],
    logLevel: 'silent',
  });
  const code = out.outputFiles[0].contents;
  return { bytes: code.length, gzip: gzipSync(code).length };
}

let failed = false;
const rows = [];
for (const b of budgets) {
  const { bytes, gzip } = await measure(b);
  const ok = bytes <= b.maxBytes;
  failed ||= !ok;
  rows.push({ entry: b.entry, imports: b.imports, bytes, gzip, maxBytes: b.maxBytes, ok });
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const r of rows) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.entry} {${r.imports.join(', ')}}: ${r.bytes} B min, ${r.gzip} B gzip (budget ${r.maxBytes} B)`);
  }
}
if (failed) {
  console.error('size-budget: an entry is over budget; shrink it or raise its budget in size-budget.json on purpose.');
  process.exit(1);
}
