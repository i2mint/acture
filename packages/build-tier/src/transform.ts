/**
 * Pure source-transform logic. The esbuild and Vite plugin wrappers
 * import this and call it from their respective transform hooks.
 *
 * Strategy: regex-based, intentionally conservative. We match a JSDoc
 * block immediately preceding a `defineCommand({ ... })` call, parse
 * the tier tag(s) from the JSDoc, and inject the corresponding
 * properties into the spec object literal.
 *
 * Why regex and not AST: the build step has to be fast (it runs on every
 * .ts file), and the patterns we accept are deliberately narrow — JSDoc
 * directly above the call site, no exotic syntax in between. If a user
 * writes `defineCommand` in a way our regex can't see, they fall back to
 * writing `tier: 'experimental'` explicitly in the spec — that path is
 * documented as the manual fallback.
 *
 * The four recognized tags:
 *   @stable
 *   @experimental
 *   @internal
 *   @deprecated [reason text...]
 *
 * Tag precedence: if multiple appear in the same JSDoc, we honour the
 * most-specific-restriction wins: internal > deprecated > experimental > stable.
 */

export type Tier = 'stable' | 'experimental' | 'internal' | 'deprecated';

export interface TierDirective {
  readonly tier: Tier;
  /** Non-empty only for `@deprecated <reason>`. */
  readonly reason?: string;
}

const TIER_PRECEDENCE: ReadonlyMap<Tier, number> = new Map([
  ['stable', 0],
  ['experimental', 1],
  ['deprecated', 2],
  ['internal', 3],
]);

/**
 * Parse a JSDoc block body (the text between `/**` and `* /` ) for tier
 * tags. Returns the most-restrictive tag found, or `undefined` if none.
 */
export function parseTierDirective(jsdocBody: string): TierDirective | undefined {
  let chosen: TierDirective | undefined;
  // Strip the leading `*` on each line so multi-line JSDoc doesn't break
  // the tag scanner.
  const stripped = jsdocBody.replace(/^\s*\*\s?/gm, '');

  const stableRe = /@stable\b/;
  const experimentalRe = /@experimental\b/;
  const internalRe = /@internal\b/;
  // `@deprecated` may carry free-text reason on the same line.
  const deprecatedRe = /@deprecated\b[ \t]*([^\n@]*)/;

  if (stableRe.test(stripped)) chosen = take(chosen, { tier: 'stable' });
  if (experimentalRe.test(stripped)) chosen = take(chosen, { tier: 'experimental' });
  const depMatch = deprecatedRe.exec(stripped);
  if (depMatch) {
    const reason = (depMatch[1] ?? '').trim();
    chosen = take(chosen, reason.length > 0 ? { tier: 'deprecated', reason } : { tier: 'deprecated' });
  }
  if (internalRe.test(stripped)) chosen = take(chosen, { tier: 'internal' });

  return chosen;
}

function take(
  current: TierDirective | undefined,
  candidate: TierDirective,
): TierDirective {
  if (!current) return candidate;
  const cur = TIER_PRECEDENCE.get(current.tier) ?? 0;
  const cand = TIER_PRECEDENCE.get(candidate.tier) ?? 0;
  return cand > cur ? candidate : current;
}

export interface TransformResult {
  readonly code: string;
  readonly changed: boolean;
  /** Tier directives applied, in order — exposed for testing. */
  readonly applied: ReadonlyArray<{ tier: Tier; reason?: string }>;
}

/**
 * Find every `/** ... * /` JSDoc block immediately followed by a
 * `defineCommand({ ... })` call, parse the tier tag(s), and inject the
 * tier (plus deprecationReason / internalToken when applicable) into
 * the spec object literal.
 *
 * - `tier` is injected at the head of the spec object.
 * - `deprecationReason` is injected after `tier`.
 * - `internalToken` references a module-scoped Symbol that is declared
 *   once at the top of the file (only when at least one `@internal`
 *   command is present in the file).
 *
 * Idempotent: if the spec already contains `tier:`, we leave it alone.
 */
export function transformSource(source: string): TransformResult {
  // Skip files that obviously do not call defineCommand.
  if (!source.includes('defineCommand')) {
    return { code: source, changed: false, applied: [] };
  }

  const applied: Array<{ tier: Tier; reason?: string }> = [];
  // Find every JSDoc block. We scan in order so insertion offsets remain
  // valid as we rebuild the source incrementally.
  const out: string[] = [];
  let i = 0;
  const len = source.length;
  let internalCount = 0;

  while (i < len) {
    const jsdocStart = source.indexOf('/**', i);
    if (jsdocStart < 0) {
      out.push(source.slice(i));
      break;
    }
    out.push(source.slice(i, jsdocStart));
    const jsdocEnd = source.indexOf('*/', jsdocStart + 3);
    if (jsdocEnd < 0) {
      out.push(source.slice(jsdocStart));
      break;
    }
    const jsdocBlock = source.slice(jsdocStart, jsdocEnd + 2);
    out.push(jsdocBlock);

    // Look ahead for `defineCommand(` after optional whitespace,
    // an optional `export ...`, an optional `const NAME = ` binding.
    const afterDocStart = jsdocEnd + 2;
    const lookahead = source.slice(afterDocStart, afterDocStart + 600);
    // The pattern captures the slice up to and including the opening
    // `{` of the spec object literal.
    // Optional declaration prefix (e.g. `export const NAME = `), then
    // `defineCommand({`. The declaration is optional so bare-call forms
    // are recognized too (`defineCommand({...})` on its own line).
    const dcRe = /^\s*(?:(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)?defineCommand\s*\(\s*\{/;
    const m = dcRe.exec(lookahead);
    if (!m) {
      i = afterDocStart;
      continue;
    }
    const tier = parseTierDirective(jsdocBlock.slice(3, -2));
    if (!tier) {
      i = afterDocStart;
      continue;
    }
    // Compute the absolute position right after the opening `{`.
    // `m.index` is 0 (we anchored with `^`); `m[0].length` is the entire
    // match, ending at the `{` (inclusive).
    const openBraceAbs = afterDocStart + m[0].length;
    // Detect if the spec already declares `tier:` — if so, leave it.
    const restOfFile = source.slice(openBraceAbs, openBraceAbs + 4000);
    if (/\btier\s*:/.test(restOfFile.slice(0, indexOfMatchingBrace(restOfFile)))) {
      i = afterDocStart;
      continue;
    }

    // Emit everything between end-of-JSDoc and openBraceAbs.
    out.push(source.slice(afterDocStart, openBraceAbs));

    // Build the injected fields.
    const injected: string[] = [];
    injected.push(` tier: ${JSON.stringify(tier.tier)},`);
    if (tier.tier === 'deprecated' && tier.reason !== undefined) {
      injected.push(` deprecationReason: ${JSON.stringify(tier.reason)},`);
    }
    if (tier.tier === 'internal') {
      injected.push(` internalToken: __actureInternalToken__,`);
      internalCount++;
    }
    out.push(injected.join(''));

    applied.push(tier.reason !== undefined ? { tier: tier.tier, reason: tier.reason } : { tier: tier.tier });

    i = openBraceAbs;
  }

  let code = out.join('');
  if (internalCount > 0) {
    code = INTERNAL_TOKEN_DECL + code;
  }
  return { code, changed: applied.length > 0, applied };
}

/** Declared at module top so every `@internal` command in the file
 *  shares it. Cross-module callers cannot see it. */
const INTERNAL_TOKEN_DECL =
  "const __actureInternalToken__ = /* @__PURE__ */ Symbol('acture.internal');\n";

/**
 * Find the offset of the matching closing brace for a string that
 * starts immediately after an opening `{` (the `{` is NOT in `text`).
 * Returns the index of the `}` (relative to `text`) on success, or
 * `text.length` if no balanced close is found.
 *
 * The scanner is intentionally minimal — it tracks nested `{}` only.
 * It treats string and template literals as opaque (skips matching
 * braces inside them) to a first approximation: handles single-quoted,
 * double-quoted, and backtick strings; does NOT handle template
 * substitutions perfectly (a `${` inside a backtick may foil it). The
 * defineCommand spec object is shallow enough that this is fine in
 * practice; users with exotic templates can write `tier: 'X'` manually.
 */
function indexOfMatchingBrace(text: string): number {
  let depth = 1;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < len) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      // line comment
      while (i < len && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < len && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return len;
}
