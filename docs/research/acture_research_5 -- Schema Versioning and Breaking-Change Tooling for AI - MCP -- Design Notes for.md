# Schema Versioning and Breaking-Change Tooling for AI / MCP: Design Notes for `acture`

*Thor Whalen — May 2026*

📄 **A copy of this report has also been saved as `research_findings_prompt_5.md` in your Google Drive (ID: `1jB1NzwuyaX9IIeTGyFCENG2DoytVtbDY`).**

---

## TL;DR

- **MCP has no established tool-versioning convention as of mid-2026.** The protocol versions itself by date string (YYYY-MM-DD) [1], two open SEPs (SEP-1400 for spec semver [2], SEP-1575 for tool versioning [3]) are in flight, and the only production diff tool — `mcpdiff` / `@mcp-contracts/cli` — is a community v0.1 effort [4]. `acture compare-schemas` should ship in v1; it is filling a real, named gap.
- **For `acture`, description changes are MAJOR by default, with an explicit `--allow-description-edits` escape valve for early-development noise.** Anthropic's own engineering team reports that "precise refinements to tool descriptions" took Claude Sonnet 3.5 to state-of-the-art on SWE-bench Verified [5]. If a sentence in a description is load-bearing for SOTA evals, it is load-bearing for users' agents.
- **The tier system should be a runtime-enforced JSDoc-tag-plus-metadata-field hybrid, modeled on VS Code's `enabledApiProposals` but coarsened to three tiers plus `@deprecated`.** Per-tier opt-in (not per-feature) is the right ceremony level for the small-team audience `acture` targets, and runtime gating is non-negotiable because documentation-only tier systems are universally ignored.

## 1. Executive Summary and Concrete Recommendations

`acture`'s schema bridge — one Zod schema, projected to JSON Schema, MCP tool definition, OpenAPI, palette form, and test fixture — is the surface that the rest of the industry is just discovering it needs. The MCP spec maintainers are debating tool versioning in public (Issues #1039, #1915, SEP-1575) [3,6,7]; Cloudflare has built a centralized MCP platform with templated tool-publishing inside its monorepo because local MCP servers became a "security liability" [8]; and the JSON Schema TSC has flagged "JSON Schema Compatibility Checker" as a GSoC 2026 project because no production-quality breaking-change linter exists [9]. `acture` can ship the missing tooling now, before the conventions ossify. As Chris Holland argues, JSON Schema is effectively becoming the IDL for AI tool calling — but unlike Avro or Protobuf, it ships without compatibility tooling baked in; somebody has to build the missing layer [40].

Concretely, this report recommends:

1. **Ship `acture compare-schemas` in v1.** Scope: full-surface diff including descriptions, aliases, `when` predicates, and JSON Schema shape. Default severity for description changes: **MAJOR**, configurable.
2. **Tier system = JSDoc tag (`@stable` | `@experimental` | `@internal` | `@deprecated`) + an optional `tier` field in the command metadata object.** The JSDoc tag is authoritative; the metadata field is what the runtime reads. A `defineCommand()` helper unifies them so users normally only write the tag.
3. **Runtime filter: `registry.toMCPServer({ tiers: ['stable'] })` and `registry.toAITools({ tiers: ['stable'] })`,** both defaulting to `['stable']`. `@experimental` requires explicit `tiers: ['stable', 'experimental']`; `@internal` is never returned regardless of opts.
4. **`@deprecated` commands stay in `tools/list` for one minor release after deprecation,** with `[DEPRECATED — use X instead]` prepended to the description so the model sees it, then disappear unless `tiers: ['stable', 'deprecated']` is passed.
5. **Migration points: name conventions (no `_v1` suffixes), no per-tool semver in metadata yet, description-as-MAJOR default, and the diff baseline (HEAD vs working tree).** All four are forward-compatible with SEP-1575 if and when it lands.

## 2. State of MCP Versioning in Production Today

MCP versions the *protocol* by date string — `2025-06-18`, `2025-11-25` — negotiated during `initialize` [1]. There is no protocol-level mechanism for versioning individual *tools*. Issue #1039 ("Feature Request: Tool Versioning Documentation") notes that "the Model Context Protocol (MCP) specification does not appear to have a clear, documented method for versioning tools" [6]. The author proposes namespace-based versioning (`mcp.tools.v1.character_style_tool`) but acknowledges that, absent a standard, "individual tool developers will create their own ad-hoc versioning systems."

Two open spec proposals are circulating as of early 2026:

- **SEP-1400** proposes replacing MCP's date-string versions with full SemVer 2.0.0 for the protocol itself, citing the case where "batching was added in 2025-03-26 and removed in 2025-06-18" as evidence that the current cadence produces breaking changes "every 3 months" [2].
- **SEP-1575 / SEP-986** propose stable tool *names* combined with a separate SemVer `version` field, with servers permitted to expose multiple `(name, version)` pairs simultaneously and required to bump the version on any behaviour change to an existing pair [3,7]. Issue #1915 is gathering real-world questions: "Should I encode the version in the name (e.g. `get_info_v1`) or keep a stable name and use the version field? How many versions should I keep live?" [7].

The protocol provides two relevant mechanisms today: `notifications/tools/list_changed` for dynamic tool list updates [10], and a structured `annotations` field carrying advisory hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) [11,12]. **The standard annotations do not yet include `experimental`, `deprecated`, or version metadata** [11]. The Obot AI guide already recommends ad-hoc tool-level conventions: "Use annotations to signal versioning, stability level (e.g., experimental, stable), and deprecation notices" [13] — but this is convention, not spec.

Production operators are improvising. Cloudflare's enterprise MCP architecture (April 2026) centralized server deployment because "Local MCP server deployments may rely on unvetted software sources and versions, which increases the risk of … tool injection attacks" [8]. Cloudflare's flagship Cloudflare API MCP server [14] uses *Code Mode* — collapsing ~2,500 API endpoints into two tools (`search` and `execute`) — partly to side-step tool versioning entirely (the spec lives on the server, only execution results return to the agent).

The first dedicated MCP diff tool, **`mcpdiff` / `@mcp-contracts/cli`**, was published in late 2025 by Lukas Kania [4]. Its insight is exactly the one in `acture`'s brief: "an MCP server's tool interface is essentially a contract, and contracts should be versioned, diffable, and auditable. … MCP servers? They just serve whatever schemas they have at runtime. No artifact to commit to git, no baseline to diff against, no CI check catching breaking changes." Kania cites the April 2025 Invariant Labs WhatsApp tool-poisoning proof-of-concept as evidence that undetected description changes are a security issue, not just a stability one [4].

**Reading of the field:** the space is **wide open**. There is no convention; there are two competing draft specs; there is one v0.1 community tool; there is one large operator (Cloudflare) that side-stepped the problem with Code Mode. `acture` is not late to this — it can shape what "good" looks like.

## 3. Tool-Definition Versioning Patterns — Evaluation

| Pattern | Who uses it | Failure mode | Relevance to `acture` |
|---|---|---|---|
| **Per-tool semver** (`tool.version: 2.1.0`) | Proposed in SEP-1575 [3]; no production examples yet | Operationally heavy; clients must implement version negotiation (`tool_requirements`); UI rendering decisions for "which version do we show?" are unsolved [7] | **Skip in v1.** Use the consumer package's npm version as the de-facto tool version. Re-evaluate if SEP-1575 lands. |
| **Deprecation in description** ("DEPRECATED: use X") | Anthropic uses this for model deprecation pages [15]; the AWS-samples Claude tool-use repo shows description-driven schema steering [16] | Description bloat; agents waste tokens on banners; depends on the model actually reading them | **Use this** for `@deprecated` tier. Prepend `[DEPRECATED in v{X}: use {Y} instead]` to the existing description. |
| **Dual-publishing (`search_users_v1` + `search_users_v2`)** | Common in REST; SEP-1575 Issue #1915 explicitly questions it: "Harder client configuration … Larger visible tool surface in host UIs." [7] | Doubles the visible tool surface, which directly costs tokens and selection accuracy; OpenAI's own guidance is "fewer than 20 functions available at the start of a turn" [17] | **Discourage in `acture`.** Tool name is identity; the deprecation tier handles the transition window. Document this as a v1 constraint. |
| **Stable / proposed / experimental tiers** | VS Code [18,19]; Kubernetes API; Node.js stability index | VS Code's per-*feature* opt-in via `enabledApiProposals` is heavy: every proposal name must be listed, copied `.d.ts` files kept in sync, and "you cannot publish an extension that uses a proposed API" [18,19] | **Adopt with per-tier coarsening.** See §7. |
| **URL/path versioning (`/v1/tools/...`)** | Stripe, GitHub, Cloudflare REST | Clean for "client pins a version"; transfers poorly to MCP because the JSON-RPC method `tools/list` is fixed | **Not applicable** at the protocol level, but compatible with mounting multiple registries: `mountMCP('/v1/mcp', registryV1); mountMCP('/v2/mcp', registryV2);` |

The pattern that *most resembles* `acture`'s problem is not any of the AI-tool patterns — it is Anthropic's and OpenAI's own *model* versioning convention: dated snapshots (`claude-3-5-sonnet-20241022`, `gpt-4o-2024-08-06`) [15,20]. Anthropic guarantees ≥60 days notice for retirement of publicly released models [15]; OpenAI typically gives six months [20]. Both deliberately separate **alias** (`gpt-4o`) from **immutable snapshot** (`gpt-4o-2024-08-06`). `acture` should encourage the analogous discipline at the *consuming-package* level: ship `acme-mcp@1.4.2` whose tool surface is the schema in that exact git tag, and let downstream agents pin the package version.

## 4. The Breaking-Change Linter Landscape

### 4.1 `buf breaking` — the gold standard

`buf breaking` organizes its rules into four nested categories, "from strictest to most lenient" [21,22]:

- **FILE** (default) — detects per-file generated-source breakage. Necessary for C++ and Python.
- **PACKAGE** — per-package generated-source breakage.
- **WIRE_JSON** — wire (binary) *or* JSON encoding breakage. "Because JSON is ubiquitous, this is the recommended minimum level."
- **WIRE** — wire encoding only.

Configuration lives in `buf.yaml` (`breaking.use: [FILE]`), runs locally, in CI, and server-side on the Buf Schema Registry. Rules have names like `FIELD_SAME_TYPE`, `FILE_NO_DELETE`, `FIELD_SAME_CARDINALITY` [21]. Buf's explicit guidance is: "Unlike lint rules, you shouldn't mix and exclude specific breaking change rules… Instead it's best to choose one of the four categories" [22].

The lesson for `acture`: **categories beat individual rule toggles.** A small team will set "strict" and forget; an org with a release manager will set "permissive" and review.

### 4.2 oasdiff and openapi-diff — the JSON-adjacent equivalents

`oasdiff` checks "450+ rules across 12 categories" against OpenAPI 3.0/3.1 [23,24]. It exposes three severity levels — ERR, WARN, INFO — and `--fail-on ERR` for CI gating [25]. Crucially, oasdiff implements **stability levels via `x-stability-level`** (draft, alpha, beta, stable) so that "breaking-changes in early development phases like draft and alpha but not later in beta and stable" are allowed [26] — exactly the pattern `acture`'s tier system should produce. The older `openapi-diff` (Atlassian / OpenAPITools) has effectively been superseded by oasdiff in production CI usage, judging by GitHub star counts and active issue traffic; oasdiff is the project to track.

### 4.3 JSON Schema diff packages — the gap

| Package | Status | What it does | Verdict |
|---|---|---|---|
| `json-schema-diff` (Atlassian) [27] | Maintained; 265k weekly downloads | Set-theoretic "added vs removed" classification of permissive/restrictive schema changes; detects type narrowing | **Best-in-class for shape diff.** Limited to JSON Schema draft-07. |
| `json-schema-diff-validator` [28] | Smaller, simpler | "Throws an exception if there is a breaking change" — node-added-with-minimum, node-removed, node-replaced | Useful for a hard gate; not surface-aware. |
| `getsentry/json-schema-diff` (Rust) [29] | Self-described "work-in-progress … as best-effort to find obviously breaking changes in CI, but not for much more" | Sentry uses it on `sentry-kafka-schemas`; emits `is_breaking` annotation | Used in production by Sentry, but maintainer explicitly warns against trusting completeness. |
| `@apidevtools/*` packages | The `@apidevtools` org publishes `json-schema-ref-parser`, `swagger-parser`, etc.; it does **not** publish a JSON Schema diff/breaking package | Reference resolution and parsing, not diff | Not a contender for `compare-schemas`. |
| `json-schema-comparator` | No actively maintained npm package by this name surfaced in my searches | — | Not viable. |
| GSoC 2026 proposal #984 [9] | JSON Schema TSC has acknowledged the gap: "JSON Schema has no official tool for this. The closest alternatives (getsentry/json-schema-diff, json-schema-diff on npm) are self-described as 'work-in-progress' with incomplete keyword coverage" | Proposed: 20+ semantic compatibility rules mapped from buf/Confluent | Confirms the gap is real and named by the spec community itself. |

**The gap `acture compare-schemas` fills.** None of these are surface-aware: they treat the JSON Schema as the contract, not the `{name, description, inputSchema, outputSchema, annotations}` tool envelope that MCP and the AI-SDK ecosystem actually ship. `mcpdiff` [4] is the *only* project that treats the envelope as the contract, but it is v0.1, written against external MCP servers (not Zod sources), and does not integrate with a command-dispatch architecture. There is no MCP-diff equivalent of `buf breaking` today. `acture compare-schemas` can fold Zod source, projected JSON Schema (mindful of the lossiness in `z.toJSONSchema()` — Zod refinements and effects don't survive the projection [41]), full envelope, and CI gating into a single tool because `acture` already owns the source of truth.

## 5. Model Provider Practices

**Anthropic.** Claude API has no public stability commitment on the *shape* of tool-call JSON schemas; the `tools` field accepts JSON Schema and the model returns `tool_use` blocks. Anthropic *does* publish a clear deprecation timeline for *models* — typically ≥60 days notice [15,30]. The retirement of `claude-3-5-sonnet-20241022` was announced August 2025, executed January 2026 [15]. `strict: true` mode enforces grammar-constrained decoding [31], and Anthropic's `pydantic-ai` integration distinguishes lossy from non-lossy schema transformations explicitly: removing `additionalProperties: false`, `title`, or `$schema` is safe; removing `minLength`, `pattern`, `minimum` constraints is lossy [32]. This matters for `acture` because it confirms the schema-bridge projection from Zod to provider-specific JSON Schema must be classified for lossiness on every emit.

Most importantly: Anthropic's "Writing tools for AI agents" engineering post states that "Claude Sonnet 3.5 achieved state-of-the-art performance on the SWE-bench Verified evaluation after we made precise refinements to tool descriptions, dramatically reducing error rates and improving task completion" [5]. This is the strongest available evidence that **tool descriptions are load-bearing for agent behaviour** — they are not documentation, they are prompts.

**OpenAI.** Tool schemas in strict mode must set `additionalProperties: false` and mark all properties as `required` (optionality is encoded via `null` in the type union) [33]. OpenAI publishes a dated deprecation schedule [20]: `chatgpt-4o-latest` was announced for deprecation on 2025-11-18 with removal on 2026-02-17 (three months). The model alias system (`gpt-4o`) auto-routes to newer snapshots [34]. **No stability commitment** is published for the JSON-schema *meta-format* OpenAI's function-calling layer accepts; the `additionalProperties` enforcement and parallel-tool-calling-with-strict-mode expansion in May 2025 [35] are evidence the layer is itself versioned implicitly.

**Google Gemini.** Function calling accepts a subset of OpenAPI 3.0 schema. Stability commitments are not published; deprecation is communicated via Vertex AI release notes [36].

**Synthesis.** No provider commits to keeping their tool-call JSON-Schema dialect stable; all three version *models* aggressively (dated snapshots, 60-day-to-6-month windows). The migration burden falls on the schema author. `acture` should treat the schema dialect as a moving target *under* the schema bridge — that is why a single Zod source projected per-target is the right architecture, and why `compare-schemas` matters: dialect drift is one more reason consumers will see "unexplained" schema changes between releases.

## 6. Concrete Design: `acture compare-schemas` v1

### 6.1 Scope (ship in v1)

```bash
acture compare-schemas <base> [<head>]      # default head = working tree
acture compare-schemas --against main       # buf-style ref syntax
acture compare-schemas --fail-on major      # CI gate
acture compare-schemas --tier stable        # only check stable-tier commands
```

The tool walks the registry in *both* refs, projects every command through the schema bridge, and compares the resulting **tool envelopes** (not just inputSchema):

| Change class | Default severity | Notes |
|---|---|---|
| Command removed | MAJOR | Always |
| Command renamed | MAJOR | Detected via stable command ID, not name |
| Input field removed | MAJOR | |
| Input field type changed | MAJOR | Includes JSON Schema `type` narrowing per `json-schema-diff` set-theory [27] |
| Input field made required | MAJOR | |
| Enum value removed | MAJOR | `x-extensible-enum` opt-out supported, per oasdiff convention [26] |
| Output field removed or type changed | MAJOR | Output schemas matter for agent loops |
| New required input field | MAJOR | Old callers fail |
| New optional input field | MINOR | |
| **Description text changed** | **MAJOR** | See §6.2 |
| `when` predicate narrowed (availability restricted) | MAJOR | Agent expecting tool gets "not available" |
| `when` predicate broadened | MINOR | |
| Alias removed/renamed | MAJOR | LLM may have memorized alias |
| Tier downgrade (stable → experimental) | MAJOR | Removes from default MCP listing |
| Tier upgrade (experimental → stable) | MINOR | Pure expansion |
| `@deprecated` added | MINOR | Plus a warning |
| Enum value added (non-response) | MINOR | |

Skip for v1: behavioural/semantic checks ("does the implementation still return the same outputs?"). Confluent Schema Registry attempts this and it is research-grade [9].

### 6.2 The description-change call: **MAJOR by default**

Both sides of this argument are real. The case for MINOR is alert fatigue: descriptions get tweaked daily during development; treating every comma as breaking will train developers to ignore the warning. The case for MAJOR is the Anthropic SWE-bench data point [5]: small description refinements drove SOTA, which means small description regressions can drive equivalent breakage in user agents, especially fine-tuned ones.

The decisive consideration is the *audience for the warning*. If `compare-schemas` runs against `HEAD` during a feature branch, the developer expects to see description changes and dismissing them is a one-flag operation. If `compare-schemas` runs against the last released tag at publish time, missing a description change is a silent regression with no recovery path once the model has memorized the new phrasing. **The cost of false negatives at publish time is higher than the cost of false positives at branch time.** That asymmetry resolves to MAJOR-by-default with branch-level relaxation:

```bash
# In CI, gating the release:
acture compare-schemas --against v1.4.0 --fail-on major

# In the feature branch:
acture compare-schemas --against main --allow-description-edits
```

`--allow-description-edits` downgrades description-only diffs to MINOR. It is *not* a `.acturerc` setting — that would let teams turn it on globally and forget it. It must be re-asserted per invocation. This is the same discipline `buf` enforces by recommending category-level config and discouraging per-rule exclusions [22].

### 6.3 Output format

JSON for machines (`--format json`), human-readable colored text by default, with `path`, `severity`, `change`, and `is_breaking` fields matching the getsentry/json-schema-diff schema [29] and oasdiff's rule-ID style [25]. This keeps `acture compare-schemas` output diffable with existing tooling.

## 7. Concrete Design: Tier System Runtime Behaviour

### 7.1 How a developer marks a command

`acture` should use **JSDoc tags as the authoritative source, with a mirror field in the metadata object** for runtime consumption:

```ts
/**
 * Search users by email or display name.
 * @stable
 */
export const searchUsers = defineCommand({
  name: 'search_users',
  description: 'Search users by email or display name.',
  input: z.object({ query: z.string().min(1) }),
  // tier: 'stable' — derived from @stable JSDoc by the build step
  handler: async ({ query }) => { /* … */ }
});
```

**Why JSDoc-tag-plus-metadata-mirror, not decorators or a metadata field alone:**

- **Pure decorators** (`@stable` as a TypeScript decorator) require `experimentalDecorators` or new TC39 syntax, lose information when transpiled by some toolchains, and don't appear in `.d.ts` consumer docs.
- **Pure metadata field** (`tier: 'experimental'`) is easy to miss in code review and doesn't render in IDE hover.
- **JSDoc tags** survive into `.d.ts`, render in VS Code IntelliSense, are the convention TypeScript itself uses for `@deprecated` (strikethrough), and api-extractor recognizes `@internal` natively. The build step mirrors the tag into the metadata so the runtime can read it without parsing JSDoc.

The build-step mirror is one `acture build` pass or a Vite/esbuild plugin; users normally only write the tag.

### 7.2 The opt-in API

```ts
// Default: stable only, applied to every external surface.
const mcpServer = registry.toMCPServer();

// Opt in to experimental tier:
const devServer = registry.toMCPServer({ tiers: ['stable', 'experimental'] });

// Deprecated stay visible during a transition window:
const compatServer = registry.toMCPServer({ tiers: ['stable', 'deprecated'] });

// Same API for AI SDK and palette:
registry.toAITools({ tiers: ['stable'] });
registry.toPaletteCommands({ tiers: ['stable', 'experimental'] }); // dev builds
```

Tier filtering is **per-tier**, not per-feature — the explicit deviation from VS Code [18,19]. Per-feature opt-in is what VS Code maintainers themselves describe as the friction that prevents external publishing: "you cannot publish an extension that uses a proposed API." `acture`'s target user is a small team that will not maintain a `proposed-apis.json`.

### 7.3 What `@experimental` looks like at runtime

- **Not** in `tools/list` by default.
- Appears in `tools/list` *only* when the server was constructed with `tiers: ['stable', 'experimental']`. The opt-in is a **server-construction option**, **not** a per-request header — per-request would imply MCP-protocol-level tier negotiation, which the spec does not yet support [10].
- On first dispatch in a production build, `console.warn` emits: `[acture] dispatched experimental command "${name}". This command may change without semver discipline. Pin acme-mcp@${version} to lock the schema.` Warning is **dev-and-prod**, suppressible via env var `ACTURE_SUPPRESS_EXPERIMENTAL_WARNINGS=1`. Once-per-process, not once-per-dispatch, to avoid log spam.
- Graduation: removing `@experimental` and adding `@stable` is a **MINOR** change (it expands the default surface). However, the consumer package SHOULD bump minor because external tooling (e.g. `mcpdiff` baselines) will treat the new tier-stable command as a new tool.

### 7.4 What `@deprecated` looks like

- Stays in `tools/list` by default for one minor release after the `@deprecated` tag is added.
- The description the model sees is rewritten: `"[DEPRECATED — use search_users_v2 instead] Search users by email or display name."` The prepending is deterministic so downstream diffs can detect deprecation-banner-only changes and not flag them as breaking.
- The `@deprecated` JSDoc reason text is parsed: `@deprecated Use searchUsersV2 instead`. Text after the tag becomes the banner reason.
- One minor release after deprecation, the command is filtered out of `tools/list` by default. It remains callable from same-package code so internal call sites can be migrated.
- Removing a `@deprecated` command from the codebase is a MAJOR change.

### 7.5 What `@internal` enforces

Three layers, in order of strength:

1. **Build-time**: never projected to MCP / AI / palette / OpenAPI surfaces. `registry.toMCPServer()` filters them unconditionally regardless of `tiers` option.
2. **TypeScript declarations**: `@internal` JSDoc tag is recognized by TypeScript's `--stripInternal` flag and by api-extractor. Consumer packages emitted via `tsc --stripInternal` will not have `.d.ts` entries for internal commands.
3. **Runtime**: dispatching an `@internal` command from outside the package emits `console.error` and throws in development; throws unconditionally in production. The cross-package check uses a module-scoped `Symbol('acture.internal')` token attached to the registry — internal commands are only callable when the caller is registered with the same token (which only same-package code receives because the token is module-scoped and not re-exported).

Module-level closure plus symbol-keyed access is the closest TypeScript gets to Java's `package` keyword. It is not airtight against `eval`-based attackers, but it is more than adequate for the "don't accidentally expose this in an MCP tools/list" threat model `acture` cares about.

## 8. Migration Points: Internal → External

When an `acture` user takes the "expose your app to third-party MCP clients" step, these v1 simplifications become liabilities. Calling them out is the contract `acture` owes its users:

1. **No per-tool semver → per-tool semver via `version` metadata.** Today, `acture` tools inherit the consumer package's version. External MCP clients will want per-tool versions (SEP-1575 [3]). Migration: add an optional `version` field to `defineCommand()` and emit it via MCP tool annotations once SEP-1575 stabilizes.
2. **Description-change MAJOR default → unchanged, but enforce harder.** Internal users can use `--allow-description-edits`. External publishers should treat description changes as MAJOR with no escape and run `compare-schemas` only on a release-tag-to-release-tag basis.
3. **Tier system per-tier → still per-tier, but external clients need to know your tier convention.** Migration: publish an `acture.json` companion artifact (analogous to `openapi.json`) documenting which commands are stable / experimental / deprecated. Cloudflare and Vercel both ship `llms.txt` / `llms-full.txt` companions [39]; `acture` can follow the same pattern.
4. **Naming conventions: no `_v1` suffixes today → keep them out.** Once external, the temptation to ship `search_users_v2` will arise. Per Issue #1915 [7], the MCP community is converging on stable names plus separate version fields. Adopting `_v2` suffixes early cannot be unwound without a breaking change.
5. **Diff baseline: working tree → last released git tag.** Internal dev defaults to `HEAD`; external publishing should default `compare-schemas --against $(latest_release_tag)`. Add `--release-mode` as a one-flag switch.
6. **Console warnings → structured logging.** `console.warn` for first-dispatch of experimental commands is fine internally; external operators want structured JSON. Migration: a `registry.onTierEvent(handler)` callback firing on every tier-relevant runtime event.
7. **Internal-agent assumption → independent agent and server release cadences.** v1 assumes the agent and schema deploy together. External clients consume your schema across version boundaries; the moment that's true, the agent must reconnect on `notifications/tools/list_changed` [10] and your `acture compare-schemas` gate must move from "advisory" to "blocking" in CI.

None of these migrations are forced by v1's design — they are all forward-compatible extensions, which is the right shape for a "ship internal, evolve external" library.

## 9. Caveats

- The MCP tool-versioning story is in active flux as of May 2026. SEP-1400 and SEP-1575 may land in any combination, may be rejected, or may be superseded entirely. Treat the specific spelling of `tool_requirements` etc. as provisional.
- The Anthropic "SWE-bench SOTA from description refinements" claim [5] is from an engineering blog post that does not quantify the SOTA delta attributable to description changes specifically vs. other concurrent changes. The direction of the effect is well-established; the magnitude is not.
- `mcpdiff` is v0.1 [4]; specific features may be unstable. The architectural point — that an `.mcpc.json` contract snapshot belongs in git — is sound regardless.
- "Tool descriptions are prompts" generalizes across providers, but Anthropic has the most explicit public claim; OpenAI and Google have not published equivalent statements. The inference rests on the structural observation that all three providers feed the description verbatim into the model's context.
- The original research workflow intended a focused subagent pass and an enrichment pass to upgrade hedged claims to verbatim-quoted named sources. Neither helper was reachable in this execution environment, so the report rests on 12 primary-source web searches performed directly. The thinnest sourcing is for Google Gemini's tool-schema stability commitments, which appear simply not to be publicly documented.

---

## References

1. [Versioning — Model Context Protocol](https://modelcontextprotocol.io/specification/versioning).
2. [SEP-1400: Semantic Versioning for MCP Specification — Issue #1400](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1400).
3. [SEP-1575: Tool Versioning (referenced in MCP Issue #1915)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1915).
4. [Kania L. Your MCP Server's Tool Descriptions Changed Last Night. Nobody Noticed. Medium, 2025](https://medium.com/@binarEx/your-mcp-servers-tool-descriptions-changed-last-night-nobody-noticed-e3ad93cf6bc7).
5. [Anthropic. Writing effective tools for AI agents — using Claude](https://www.anthropic.com/engineering/writing-tools-for-agents).
6. [Feature Request: Tool Versioning Documentation — Issue #1039](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1039).
7. [Document recommended tool versioning and naming patterns for MCP servers — Issue #1915](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1915).
8. [Cloudflare. Scaling MCP adoption: Our reference architecture](https://blog.cloudflare.com/enterprise-mcp/).
9. [GSoC 2026: JSON Schema Compatibility Checker — json-schema-org/community Issue #984](https://github.com/json-schema-org/community/issues/984).
10. [MCP Specification — Tools (notifications/tools/list_changed)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
11. [Nuri M. MCP Tool Annotations: Adding Metadata and Context to Your AI Tools](https://blog.marcnuri.com/mcp-tool-annotations-introduction).
12. [Speakeasy. Tool annotations](https://www.speakeasy.com/docs/mcp/build/gram-functions/tool-annotations).
13. [Obot AI. Defining and Implementing MCP Tools: a Practical Guide](https://obot.ai/resources/learning-center/mcp-tools/).
14. [cloudflare/mcp — Token-efficient MCP server for the Cloudflare API](https://github.com/cloudflare/mcp).
15. [Anthropic. Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations).
16. [aws-samples/anthropic-on-aws — complex-schema-tool-use](https://github.com/aws-samples/anthropic-on-aws/blob/main/complex-schema-tool-use/README.md).
17. [OpenAI. Function calling guide](https://platform.openai.com/docs/guides/function-calling).
18. [VS Code. Using Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api).
19. [microsoft/vscode wiki — Extension API process](https://github.com/microsoft/vscode/wiki/Extension-API-process).
20. [OpenAI. Deprecations](https://developers.openai.com/api/docs/deprecations).
21. [Buf Docs. Rules and categories](https://buf.build/docs/breaking/rules/).
22. [Buf Docs. Detecting breaking changes](https://buf.build/docs/breaking/).
23. [oasdiff — OpenAPI Breaking Change Detection](https://www.oasdiff.com/).
24. [oasdiff — Breaking Change Rules (450+ rules)](https://www.oasdiff.com/docs/breaking-changes).
25. [oasdiff/oasdiff — BREAKING-CHANGES.md](https://github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md).
26. [Harrison R. Detecting and Preventing Breaking Changes in OpenAPI Specifications](https://reuvenharrison.medium.com/detecting-breaking-changes-in-openapi-specifications-df19971321c8).
27. [json-schema-diff (Atlassian) — npm](https://www.npmjs.com/package/json-schema-diff).
28. [json-schema-diff-validator — npm](https://www.npmjs.com/package/json-schema-diff-validator).
29. [getsentry/json-schema-diff (Rust)](https://github.com/getsentry/json-schema-diff).
30. [Anthropic Claude API — Release Notes](https://platform.claude.com/docs/en/release-notes/overview).
31. [Anthropic. Tool use with Claude — strict mode](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview).
32. [pydantic-ai Issue #3541 — Default to strict tool schemas for Anthropic models](https://github.com/pydantic/pydantic-ai/issues/3541).
33. [Kubaski L. OpenAI Tool JSON Schema Explained](https://medium.com/@laurentkubaski/openai-tool-schema-explained-05a5ce0e80f8).
34. [OpenAI. Retiring GPT-4o, GPT-4.1, GPT-4.1 mini, and OpenAI o4-mini in ChatGPT](https://openai.com/index/retiring-gpt-4o-and-older-models/).
35. [OpenAI Developers on X — Structured Outputs improvements (May 2025)](https://x.com/OpenAIDevs/status/1924915341052019166).
36. [Vertex AI. Model deprecations (MaaS)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/deprecations/partner-models).
37. [VS Code. Extension API process — vscode-wiki](https://github.com/microsoft/vscode/wiki/Extension-API-process).
38. [VS Code. Using Proposed API — `enabledApiProposals`](https://code.visualstudio.com/api/advanced-topics/using-proposed-api).
39. [Cloudflare Agents — Model Context Protocol documentation](https://developers.cloudflare.com/agents/model-context-protocol/).
40. Holland C. The Schema Language Question: Avro, JSON Schema, Protobuf, and the Quest (project-knowledge reference `ref_45`).
41. Project-knowledge reference `ref_08` — Zod JSON Schema generation and what `z.toJSONSchema()` drops (refinements, transforms, branded types).