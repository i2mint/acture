---
name: acture-schema-bridge
description: Load context on acture's schema bridge — Zod → JSON Schema projection, MCP tool emission, AI SDK tool definitions, Standard Schema compatibility, and the JSON-Schema-representable subset rule. Use when working on toJsonSchema, the MCP adapter, the Vercel AI adapter, the Anthropic adapter, schema validation at registration, or compare-schemas. Triggers on "JSON Schema", "Zod schema", "z.toJSONSchema", "MCP tool", "AI tool definition", "schema bridge", "Standard Schema", "Valibot", "param schema validation". Do NOT use for general CommandRecord questions (load `acture-command-record-shape`) or for the tier/versioning system (load `acture-tier-system`).
---

# acture schema bridge

The schema bridge connects acture's authoring-time schema (Zod by default) to the wire format every external consumer needs: JSON Schema.

## The pipeline

```
                         CommandRecord.params
                                  │
                                  │  (StandardSchema<P>: Zod | JSON Schema as const | Valibot)
                                  ▼
              ┌──────────────────────────────────────────────────┐
              │           toJsonSchema(record, options?)          │
              │   options.converter ?? z.toJSONSchema (default)   │
              └──────────────────────────────────────────────────┘
                                  │
                                  ▼
                              JSON Schema
                                  │
              ┌───────────────────┼────────────────────┐
              ▼                   ▼                    ▼
       MCP tool envelope    AI SDK tool         Palette form (rjsf)
       {name, desc, schema}    z-or-jsonschema     OR adapter (autoform)
```

## JSON Schema is the IDL

Per the central paper §2.3 and §5: JSON Schema is the universal interchange format. Every major AI tool framework converges on it (OpenAI function calling, Anthropic tool use, Google function declarations, MCP). The TypeScript schema library is the *authoring layer*; JSON Schema is the *wire format*.

This means acture's job is two-way:
1. Accept Standard Schema-compliant input from authors (Zod, JSON Schema literals, Valibot).
2. Project to JSON Schema on demand for any external consumer.

## The JSON-Schema-representable subset (hard rule)

Author command parameter schemas MUST be in the JSON-Schema-representable subset of Zod. This is enforced at registration time.

**Forbidden in `params`:**
- `z.transform()` — coercion belongs in the handler.
- `z.date()` — use `z.string().datetime()` and parse in the handler.
- `z.bigint()` — JSON doesn't have bigint; use `z.string()` and parse.
- `z.set()`, `z.map()` — JSON doesn't have them.
- `z.custom()` — by definition not exportable.
- `z.refine()` with side-effecting validators — pure refinements are OK if they emit predictable JSON Schema `pattern`/`format`; otherwise put validation in the handler.

**Why:** the schema must round-trip through `JSON.stringify(z.toJSONSchema(s))` cleanly. If it doesn't, the MCP tool emitted to an LLM will be subtly wrong (description, but no validation enforcement), and `acture compare-schemas` will produce garbage diffs.

Validate this at registration; throw loudly with the specific field name that violates.

## toJsonSchema(record, options?)

```ts
type ToJsonSchemaOptions = {
  /** Override the default Zod converter. Use this when the host injects a
   *  conversion function (e.g., for non-Zod Standard Schema implementations). */
  converter?: (schema: unknown) => Record<string, unknown>;

  /** Include description? Default: true. */
  includeDescription?: boolean;

  /** Strict mode (per OpenAI strict tool schemas): set additionalProperties: false,
   *  mark all properties required (optional fields encoded via type union with null).
   *  Default: false. */
  strict?: boolean;
};

export function toJsonSchema(
  record: CommandRecord,
  options?: ToJsonSchemaOptions
): {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};
```

Default converter: Zod v4's `z.toJSONSchema(schema)`. The function returns the *MCP-shaped envelope*, not just the inputSchema, because every external consumer (MCP, OpenAI, Anthropic, Vercel AI SDK) wants the envelope.

## MCP tool emission

```ts
registry.toMCPServer({ tiers: ['stable'] }) // default
```

Iterates registry, filters by tier (default: `['stable']` only), projects each through `toJsonSchema`, and registers as MCP tool. Per research-5:

- **Description prefixes:** `@deprecated` commands get `[DEPRECATED — use X instead]` prepended to description in the MCP-visible envelope.
- **No tools/list noise for `@internal`:** never emitted regardless of `tiers` option.
- **`notifications/tools/list_changed` fires** when the registry's tier-filtered view changes (e.g., a command graduates from experimental to stable).

## AI SDK adapters

```ts
registry.toAITools({ tiers: ['stable'] }) // default
```

For Vercel AI SDK: returns `Record<string, Tool>` keyed by command id, ready to pass to `streamText({ tools })`. Each `Tool` has `{ description, parameters: ZodSchema, execute }`.

For Anthropic SDK: returns `AnthropicTool[]` with `{ name, description, input_schema }`. The Vercel SDK uses Zod directly; Anthropic SDK takes JSON Schema, so the Anthropic projection uses `toJsonSchema` while the Vercel projection passes the Zod schema through.

## Strict mode (OpenAI)

Per research-5 §5: OpenAI's strict mode requires `additionalProperties: false` and all properties marked `required` (optionality encoded via type union with `null`). The strict transformation is opt-in:

```ts
registry.toAITools({ strict: true })
```

Document the lossiness: removing `additionalProperties: false` for non-strict is safe; lossy transformations (removing `minLength`, `pattern`, `minimum` constraints) MUST be reported via a `warnings: string[]` in the result so the caller can decide whether to proceed.

## compare-schemas integration

The `acture compare-schemas` CLI (Phase 4) reads schemas via this same bridge. The diff classifies changes per research-5 §6.1 table. Anything the bridge filters out (e.g., `@internal` commands) does not contribute to the diff.

## Standard Schema compatibility

Per `docs/redesign_takeaways.md` §1.3: accept any of:

1. **Zod** (default, recommended) — `params: z.object(...)`.
2. **JSON Schema as const** — `params: { type: "object", properties: {...} } as const satisfies JSONSchema`.
3. **Valibot** — accepted at the boundary; internally normalized to JSON Schema via `valibot/to-json-schema` or equivalent.

The detection logic: if `params` has a `~standard` property (Standard Schema marker), call its `~standard.validate`. Otherwise, treat as Zod by default.

## What stays on the application layer (NOT in `params`)

Complex validation logic that uses language-specific features:
- Cross-field constraints (`if x then y is required`).
- Domain validation (`email must exist in the users table`).
- Async validation.

These live in the command handler. The handler can throw a typed validation error; the dispatcher converts to `{ ok: false, error }`.

## See also

- `acture-command-record-shape` — for `params` field semantics
- `acture-tier-system` — for description-change-is-MAJOR and tier filtering
- `docs/research/acture_research_5 -- Schema Versioning ...md` — the source for description-is-MAJOR
- `docs/command_dispatch_journal_article.md` §2.3 and §5 — conceptual basis
