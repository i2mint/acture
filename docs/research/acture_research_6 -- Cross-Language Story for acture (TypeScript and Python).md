# Cross-language story for *acture* (TypeScript ↔ Python)

*Author: Thor Whalen — May 2026*

> Saved (intended path): `research_findings_prompt_6.md`. The runtime in which this report was produced does not expose filesystem tools; the report content below is the deliverable — copy it into the file directly.

---

## Executive summary

If the **primary v1 audience is LLM agents**, ship *acture* as an **MCP server** and treat MCP — not OpenAPI, not a hand-rolled RPC — as the wire. Every command registered through *acture*'s `StableCommand` interface [1] should be auto-projected into an MCP tool whose `inputSchema` is the JSON Schema you already produce from each command's Zod schema via `ts-json-schema-generator` [2] or Zod 4's built-in `z.toJSONSchema` [3]. Use the official `@modelcontextprotocol/sdk` `McpServer.registerTool()` API [4,5] on the TS side, and the official `mcp`/`FastMCP` Python SDK [6,7] on the consumer side. **Do not** ship a Pydantic-codegen companion or a full OpenAPI emitter in v1 — both are valuable later, but neither is the agent-native path and both fight *acture*'s open/closed plugin nature.

For v1, publish a thin Python package — provisionally **`acture-client`** (the name `acture` on PyPI should be reserved if available, but verify with `pip index versions acture` before claiming it) — that wraps an `mcp` client session in the dict-like, facade-style idiom familiar to `dol`/`py2store` users [8,9]. Post-v1, add a typed Pydantic-codegen layer for power users and an inverse-direction "skill kit" so Python authors can register commands that *acture* surfaces to the same MCP endpoint.

---

## Key findings

1. **MCP is the right v1 wire for agent access.** It exists precisely to standardize "tool" invocation by LLMs, it is JSON-RPC 2.0 over stdio or streamable HTTP, and its `inputSchema` slot is JSON Schema 2020-12 [10]. Anthropic, OpenAI, Google, and Microsoft all back it; Linear, GitHub, Cursor, and dozens of others ship production MCP servers [11,12].
2. **JSON Schema is *almost* enough — but not for free.** Zod-to-JSON-Schema is lossy on refinements, transforms, and branded types [3,13,14]. You will need `.describe()` discipline, a small set of `x-*` extensions, and (post-v1) a `meta` registry for round-tripping semantic intent.
3. **For Python *humans* (not agents), a typed Pydantic SDK is materially nicer than calling MCP tools by string name.** `datamodel-code-generator` produces clean Pydantic v2 models from JSON Schema today [15], and `openapi-python-client` produces idiomatic async clients from OpenAPI [16]. The cost is a second emission pipeline.
4. **Direct TS↔Python codegen tools exist but are one-directional and Pydantic-shaped** (`pydantic-to-typescript` [17], not the other way). There is no mature "Zod-to-Pydantic" tool; the bridge is always JSON Schema.
5. **The inverse direction (TS frontend → Python command) has a clear winner per audience**: MCP for agents, FastAPI + `@hey-api/openapi-ts` [18] for humans. gRPC-web and tRPC are wrong tools for this job.
6. **The user's own ecosystem points the way.** `py2mcp` (already on PyPI), `ju` (JSON-schema utilities), `dol`, `meshed`, and `qh` [19] together form a `py2X` pattern — *acture*'s Python companion should mirror it, not invent a new convention.

---

## Comparison table — the four patterns

| Pattern | DX (TS author) | DX (Py consumer) | Drift risk | Runtime overhead | Ceremony | LLM-friendliness |
|---|---|---|---|---|---|---|
| **(a) MCP over stdio/HTTP** | Low — `server.registerTool()` with a Zod schema [4] | Low for agents (zero glue); medium for humans (stringly-typed `call_tool`) | Very low (schema is the wire) | One JSON-RPC roundtrip [20] | Low | **Native** |
| **(b) JSON-Schema → Pydantic codegen** | Low — emit JSON Schema per command [3] | Very high — `from acture_models import RunQuery` with full IDE support [15] | Medium (codegen step must run in CI) | One HTTP roundtrip + Pydantic validate | Medium (regen pipeline) | Indirect (need a tool layer on top) |
| **(c) OpenAPI emission** | Medium — must invent paths, methods, operationIds [21] | High — `openapi-python-client` gives full async SDK [16] | Medium (drift between code and spec is the classic FastAPI failure mode [22]) | One HTTP roundtrip | High (OpenAPI semantics don't fit command dispatch well) | Indirect |
| **(d) Direct TS↔Python codegen** | High — `pydantic-to-typescript` exists [17] but reverse (Zod → Pydantic) does not; you always route through JSON Schema | Same as (b) | Same as (b) | Same as (b) | High (two codegen graphs) | Indirect |

---

## Details — pattern-by-pattern code sketches

### (a) MCP over stdio/HTTP — recommended for v1

**TS side (acture emits each command as an MCP tool):**

```ts
// acture/src/adapters/mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { StableCommand } from "../commands";   // §2 of journal article [1]

export function actureMcpServer(registry: Map<string, StableCommand<any, any>>) {
  const server = new McpServer({ name: "acture", version: "1.0.0" });
  for (const [name, cmd] of registry) {
    server.registerTool(
      name,
      {
        description: cmd.describe,
        inputSchema: cmd.input,         // Standard Schema (Zod / Valibot / ArkType) [4]
        outputSchema: cmd.output,
      },
      async (args) => {
        const result = await cmd.handler(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  }
  return server;
}

// Entry point
const server = actureMcpServer(globalRegistry);
await server.connect(new StdioServerTransport());
```

Zod schemas attached to each command are reused both for runtime parsing on the TS host and for tool advertisement to the agent. `registerTool` accepts Standard Schema [4], so Valibot/ArkType users are not excluded.

**Python side — agent-style consumption:**

```python
# pip install mcp
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(command="node", args=["acture-server.js"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            for t in tools.tools:
                print(t.name, "—", t.description)
            result = await session.call_tool(
                "runQuery", arguments={"sql": "SELECT 1"}
            )
            print(result.structuredContent)

asyncio.run(main())
```

This is verbatim the official Python SDK pattern [6]. For agentic frameworks (Claude Code, Cursor, the OpenAI Agents SDK), there is no glue at all — they consume the MCP server directly.

**What breaks first.** The MCP spec is young and versioned by date (e.g., `2025-11-25` [10]). Pin the spec date in both servers and clients; treat upgrades as breaking. Transport story has churn — SSE is being deprecated in favor of streamable HTTP [11]. Zod refinements are silently dropped when converted to JSON Schema [3,13], so agents will not see the constraint and you must enforce it server-side.

### (b) JSON Schema → Pydantic codegen

**TS side (emit a schema bundle):**

```ts
// scripts/emit-schemas.ts
import { writeFileSync } from "node:fs";
import * as z from "zod";
import { globalRegistry } from "../src/registry";

const bundle = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $defs: Object.fromEntries(
    [...globalRegistry].map(([name, cmd]) => [
      name,
      {
        description: cmd.describe,
        input:  z.toJSONSchema(cmd.input),    // Zod 4 built-in [3]
        output: z.toJSONSchema(cmd.output),
      },
    ]),
  ),
};
writeFileSync("acture.schema.json", JSON.stringify(bundle, null, 2));
```

**Python side — generate models, then import them:**

```bash
datamodel-codegen \
  --input acture.schema.json \
  --input-file-type jsonschema \
  --output-model-type pydantic_v2.BaseModel \
  --output acture_models.py
```

```python
# user code
from acture_models import RunQueryInput, RunQueryOutput
import httpx

async def run_query(sql: str) -> RunQueryOutput:
    payload = RunQueryInput(sql=sql)
    async with httpx.AsyncClient() as c:
        r = await c.post("http://acture/cmd/runQuery", json=payload.model_dump())
    return RunQueryOutput.model_validate(r.json())
```

`datamodel-code-generator` handles `$ref`, `allOf`, `oneOf`, `anyOf`, enums, and nested types and emits clean Pydantic v2 [15]. The DX on the Python side is excellent — full IDE completion, `model_validate`, descriptive docstrings derived from JSON Schema `description` (which itself derives from Zod `.describe()`).

**What breaks first.** The HTTP transport layer is *your* invention — no protocol like MCP to keep both ends honest. The codegen must run in CI and the generated `acture_models.py` must be committed and version-pinned, otherwise field renames in TS quietly become unknown-key errors in Python. Branded types, refinements, and discriminated-union narrow-by-callback patterns in Zod do not survive the round trip [13,14].

### (c) OpenAPI emission

**TS side — derive an OpenAPI 3.1 doc from the registry:**

```ts
// scripts/emit-openapi.ts
import { writeFileSync } from "node:fs";
import * as z from "zod";
import { globalRegistry } from "../src/registry";

const paths: Record<string, any> = {};
for (const [name, cmd] of globalRegistry) {
  paths[`/cmd/${name}`] = {
    post: {
      operationId: name,                    // unique-name discipline [25]
      summary: cmd.describe,
      requestBody: {
        required: true,
        content: { "application/json": { schema: z.toJSONSchema(cmd.input) } },
      },
      responses: {
        "200": {
          description: "OK",
          content: { "application/json": { schema: z.toJSONSchema(cmd.output) } },
        },
      },
    },
  };
}
const openapi = {
  openapi: "3.1.0",
  info: { title: "acture", version: "1.0.0" },
  paths,
};
writeFileSync("openapi.json", JSON.stringify(openapi, null, 2));
```

You also need a minimal HTTP server on the TS side (e.g., Hono or Express) that dispatches `POST /cmd/{name}` back into the registry. That code is mechanical and omitted for brevity.

**Python side — generate a fully typed async SDK:**

```bash
# pipx install openapi-python-client
openapi-python-client generate --path openapi.json --meta pdm
```

```python
# user code — generated module is named "acture-client"
from acture_client import Client
from acture_client.api.default import run_query
from acture_client.models import RunQueryInput

client = Client(base_url="http://acture")

async def main():
    payload = RunQueryInput(sql="SELECT 1")
    resp = await run_query.asyncio(client=client, body=payload)
    print(resp)
```

This is the FastAPI-style flow, in reverse: `openapi-python-client` produces attrs-or-Pydantic models, fully typed endpoint functions, and an async `Client` [16,23]. Tooling support is huge (Speakeasy, Stainless, Fern, OpenAPI Generator) [21,27].

**What breaks first.** OpenAPI imposes REST semantics on a function-call protocol — you're now responsible for stable `operationId`s, sensible HTTP status mapping, and not breaking the spec on rename [22,25]. The DocSmith post-mortem captures the canonical failure: a developer renames `user_id → userId`, forgets to regenerate the spec, the partner's generated client builds against a stale contract, and integration breaks overnight [22]. Mitigation requires hard CI gates that fail the build when the registry changes without a regenerated spec hash.

### (d) Direct TS↔Python codegen

There is no "Zod-to-Pydantic" tool in mature use. The bridges go via JSON Schema. `pydantic-to-typescript` [17] goes the wrong direction for *acture* (it assumes Python is the source of truth). The operational pattern is the same as (b), with a different schema-extraction front end.

**TS side — emit JSON Schema directly from type declarations (Zod-agnostic):**

```ts
// scripts/emit-types.ts  (or run ts-json-schema-generator as a CLI)
import { createGenerator } from "ts-json-schema-generator";
import { writeFileSync } from "node:fs";

const generator = createGenerator({
  path: "src/commands/*.ts",
  tsconfig: "tsconfig.json",
  type: "*Input",                          // every exported *Input type
  topRef: false,
  expose: "all",
});
const schema = generator.createSchema("*Input");
writeFileSync("acture.types.json", JSON.stringify(schema, null, 2));
```

`ts-json-schema-generator` walks TypeScript type declarations and produces JSON Schema directly, without needing Zod as an intermediary [2]. It is the right tool when *acture* commands have plain-TS input types rather than Zod schemas.

**Python side — same `datamodel-codegen` invocation as pattern (b):**

```bash
datamodel-codegen \
  --input acture.types.json \
  --input-file-type jsonschema \
  --output-model-type pydantic_v2.BaseModel \
  --output acture_models.py
```

```python
# user code is identical to pattern (b)
from acture_models import RunQueryInput, RunQueryOutput
# ... HTTP / RPC / MCP dispatch as appropriate
```

For the inverse leg (Python → TypeScript), `pydantic2ts` wraps `json-schema-to-typescript` over a Pydantic module's auto-generated JSON Schema [17]:

```bash
pydantic2ts --module acture_skills.commands --output ./frontend/actureSkills.ts
```

```ts
// frontend/actureSkills.ts (auto-generated)
export interface RunQueryInput {
  sql: string;
  limit?: number;
}
```

**What breaks first.** All of (b)'s failure modes, plus dependency on Node tools (`json-schema-to-typescript`, `json2ts`) inside a Python release pipeline [17] — non-trivial CI plumbing. The two codegen graphs (TS→Py and Py→TS) drift independently; without a single emission script that produces both, you will get one direction working and the other silently wrong.

---

## Is JSON Schema enough? What is lost in the round trip?

JSON Schema preserves:

- Structural shape, required/optional, defaults
- Primitive constraints: `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `format`, `enum`
- Composition: `oneOf`, `anyOf`, `allOf`, `$ref`, recursive `$defs`
- Descriptions (from Zod `.describe()`) — these become Pydantic `Field(description=...)` [15]

JSON Schema **loses**, or at best mangles:

- **Zod refinements** (`.refine()`, `.check()`): silently dropped because they are arbitrary functions [3,13,14]
- **Zod transforms** (`.transform()`): explicitly disallowed by `z.toJSONSchema` because the output type is no longer introspectable [14]
- **Branded types** (`z.brand<PlainDate>`): degrade to the underlying primitive; the nominal information is gone [13]
- **Discriminated unions** with custom narrow functions: the discriminator survives, the narrowing logic does not
- **Custom error messages** on refinements: not standardized in JSON Schema; must travel via `x-error-message` or similar extensions
- **Zod 3 `.preprocess()`**: same problem as transform — black-box function

**What you need to add back manually.** Three categories:

1. **`.describe()` everywhere.** Treat the absence of `.describe()` on a Zod field as a lint error. Pydantic models generated from schemas without descriptions are nearly unreadable.
2. **`x-*` extensions on the JSON Schema side** for semantically rich types: `x-brand: "PlainDate"`, `x-acture-discriminator: "kind"`, `x-acture-error-code: "INVALID_DATE"`. Tools that don't understand them ignore them, which is the JSON-Schema-correct behavior.
3. **A small registry of Python "augmenters"** that map `x-brand` → a Pydantic `Annotated[str, AfterValidator(parse_plain_date)]` recipe. This belongs in the Python companion package, not in the codegen tool itself.

For an LLM agent consumer, none of this matters — agents read `description` and constraints, and that's it. For a human Python consumer, *all* of this matters. This asymmetry is the single most important design fact, and it justifies the v1/post-v1 split below.

---

## The inverse direction — TS frontend calling Python commands

The journal article (§3) describes a Provider/dispatcher model [1] where any command source can register into the same registry. When the source is Python, the wire choice depends on the consumer:

| Wire | Best for | Why | Caveats |
|---|---|---|---|
| **MCP** (Python server, TS client in Node or browser via bridge) | **Agents reading from a React app** | Same protocol, both directions — schema introspection is uniform [11,12] | Browsers can't open stdio; need a Node bridge or streamable HTTP [10,24] |
| **FastAPI + `@hey-api/openapi-ts`** [18] | **Human-driven UI** | FastAPI auto-emits OpenAPI 3.1 [25]; hey-api produces excellent typed fetch clients used by Vercel, PayPal, OpenCode [18] | OpenAPI drift; FastAPI route style doesn't natively map to command dispatch |
| **gRPC-web** | Polyglot teams with existing protobuf infra | Strong typing, streaming | Browser support requires Envoy proxy; protobuf adds a third schema language [26] |
| **tRPC-style** | Pure TS↔TS only | Type inference across the wire | **Not applicable** here — tRPC's magic is end-to-end TS inference, which dies the moment Python enters the room |
| **JSON-RPC 2.0** | Minimalist hand-rolled | Same JSON-RPC envelope MCP itself uses [20] | You'd be rebuilding 80% of MCP for no agent benefit |

**Recommendation for the inverse direction.** If the React app is calling Python and the caller is an LLM agent (e.g., a Claude/Cursor pane embedded in the UI), use **MCP**: run FastMCP [7] in Python and the official `@modelcontextprotocol/sdk` client [4] in the browser-side bridge. If the React app is a *human* UI dispatching to Python, use **FastAPI + hey-api**: it is the path of least resistance, has the largest community, and the `openapi-typescript` output is genuinely pleasant [18,25].

Notably, *acture*'s architecture (Section 3.3 of the journal article [1]) already names MCP integration as a goal. Reusing MCP as both the outbound and inbound wire — agent → acture, and (via a "skill kit") Python → acture → agent — keeps the system to one protocol instead of three.

---

## Real-world case studies

### 1. Linear's MCP server — production-scale agent endpoint

Linear shipped its remote MCP server at `mcp.linear.app` in May 2025, built in partnership with Cloudflare and Anthropic [11]. It exposes ~25 tools for issue/project/cycle management to Claude, ChatGPT, Cursor, and any other MCP-compatible client via OAuth 2.1. **Lessons:** (i) the same JSON-RPC tool schema served every agent without per-vendor adapters — the decoupling claim is real; (ii) Linear migrated from SSE to streamable HTTP within months — pin your transport [11]; (iii) the team did not need to ship vendor-specific SDKs because the MCP protocol *is* the SDK.

### 2. FastAPI + `@hey-api/openapi-ts` at Vercel/PayPal/OpenCode

`@hey-api/openapi-ts` is the de facto FastAPI → TS codegen pipeline, used by Vercel, PayPal, and OpenCode [18]. Tiangolo's own FastAPI docs walk through the exact flow: emit `/openapi.json`, run `npx @hey-api/openapi-ts`, get a typed client with inline errors and autocomplete [25]. **Lessons:** (i) operationId hygiene matters — without a custom `generate_unique_id_function`, you get ugly names like `items-get_items` [25]; (ii) commit the generated client into the repo until you're ready to publish it as a versioned package [27]; (iii) the FastAPI community has settled the "shared models" question by treating Pydantic as the source of truth and generating TS — but this is the *opposite* direction from what *acture* needs.

### 3. The OpenAPI spec-drift post-mortem (DocSmith / community)

A widely cited 2025 case study describes a partner integration that broke overnight when a developer merged a PR renaming `user_id` to `userId` without updating the OpenAPI spec [22]. The author concludes: "The real fix is to have only one source of truth." The takeaway for *acture*: **if you ship an OpenAPI spec, generate it from the Zod schemas, never hand-author it, and fail CI when the diff is empty.** The same lesson is reinforced by FastAPI's best-practices repo [28], which advocates colocating Pydantic schemas with the routes that use them and emitting OpenAPI as a build artifact.

### Honorable mention — `py2mcp` (Thor Whalen's own work)

The author already publishes `py2mcp` ("Generate MCP servers from Python functions — the py2X pattern for Model Context Protocol") [19]. This is direct evidence that the `py2X` facade pattern is the right shape for *acture*'s Python companion: a thin, dict-like, progressive-disclosure surface that hides MCP transport details from the casual user.

---

## Recommendation for *acture*

### v1 — ship MCP, period.

1. **Add an MCP adapter to *acture* core** (`acture/src/adapters/mcp.ts`), implemented as a Provider in the §3 dispatcher model [1]. It walks the command registry and calls `McpServer.registerTool()` for each entry [4,5]. The adapter is the *only* default cross-language path in v1.
2. **Use Zod 4's built-in `z.toJSONSchema`** [3] when an MCP client requests `tools/list`. Do not invent a custom schema language. Embrace the lossy edges (refinements, transforms, brands) — agents do not care, and human Pydantic users are not the v1 audience.
3. **Publish `acture-client` on PyPI** as a tiny package (≤300 LoC) that wraps `mcp.ClientSession` in a dict-like facade matching `dol` conventions [8,19]. Sketch below.
4. **Do not** ship an OpenAPI emitter, Pydantic codegen, or a parallel HTTP API. They add surface area and confuse the message.

### Post-v1 — typed Pydantic SDK and skill kit

5. **Add `acture-models` as a generated package** built by running `datamodel-code-generator` over `z.toJSONSchema` output of the registry [3,15]. This is for Python *humans* who want IDE completion, not for agents. Publish on every *acture* release.
6. **Add a Python "skill kit"** (`acture-skills`) that lets Python authors register commands which *acture* surfaces back through the same MCP endpoint. This implements the inverse direction over the same wire — the §3 Provider model, symmetrically.
7. **Consider a FastAPI shim** only if and when a human-facing React UI emerges as a v2 use case. At that point, FastAPI + `@hey-api/openapi-ts` [18,25] is the proven path.

### Python companion package — proposed scope and API

**Name.** First choice: `acture` on PyPI if it is available (`pip index versions acture` to verify — I could not confirm availability from public search). Second choice: `acture-client`. The user already uses single-word names like `dol`, `ju`, `meshed`, `oa`, `qh` [19], so a single word is on-brand.

**API sketch (v1):**

```python
"""acture — Python client for an acture MCP server.

Progressive disclosure: simple things simple, complex things possible.
Composition over inheritance. Facade over the MCP protocol.
"""
from __future__ import annotations
from typing import Any, AsyncIterator, Mapping
from contextlib import asynccontextmanager
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class Acture(Mapping[str, "Command"]):
    """Dict-like facade over an acture MCP server.

    >>> async with Acture.from_stdio(["node", "acture-server.js"]) as a:
    ...     list(a)                         # tool names, like dict keys
    ...     a["runQuery"].schema            # JSON Schema for input
    ...     await a["runQuery"](sql="...")  # call by name, structured result
    """

    def __init__(self, session: ClientSession, tools: dict[str, dict]):
        self._session = session
        self._tools = tools

    @classmethod
    @asynccontextmanager
    async def from_stdio(cls, argv: list[str]) -> AsyncIterator["Acture"]:
        params = StdioServerParameters(command=argv[0], args=argv[1:])
        async with stdio_client(params) as (r, w):
            async with ClientSession(r, w) as s:
                await s.initialize()
                listing = await s.list_tools()
                tools = {t.name: t.model_dump() for t in listing.tools}
                yield cls(s, tools)

    @classmethod
    @asynccontextmanager
    async def from_http(cls, url: str) -> AsyncIterator["Acture"]:
        ...  # streamable HTTP transport — left as an exercise

    # Mapping protocol — dol/py2store style
    def __iter__(self):        return iter(self._tools)
    def __len__(self):         return len(self._tools)
    def __getitem__(self, k):  return Command(k, self._tools[k], self._session)
    def __contains__(self, k): return k in self._tools


class Command:
    """A bound, callable command. argh-friendly via .as_cli()."""
    def __init__(self, name, meta, session):
        self.name, self._meta, self._session = name, meta, session

    @property
    def schema(self) -> dict:    return self._meta["inputSchema"]
    @property
    def describe(self) -> str:   return self._meta.get("description", "")

    async def __call__(self, **kwargs) -> Any:
        result = await self._session.call_tool(self.name, arguments=kwargs)
        return result.structuredContent or result.content

    def as_cli(self):
        """Return an argh-compatible function for CLI dispatch."""
        import argh
        async def _runner(**kwargs):
            return await self(**kwargs)
        _runner.__name__ = self.name
        _runner.__doc__ = self.describe
        return argh.arg(...)(_runner)
```

This is **facade-style** (one entry point), **dispatch-to-interface** (`Mapping[str, Command]`), **dependency-injected** (the `ClientSession` is injected via the classmethod constructors), **open-closed** (subclass `Acture` to add caching, rate-limiting, etc. without modifying the base), and **plugin-friendly** (the `from_*` constructors are a registry). It mirrors the conventions of `dol` [8,9], `oa`, and `py2mcp` [19].

**Post-v1 extension (with codegen):**

```python
# acture_models.py is generated at acture release time
from acture_models import RunQueryInput, RunQueryOutput

async with Acture.from_stdio(["node", "acture-server.js"]) as a:
    typed = a.typed(RunQueryInput, RunQueryOutput)   # progressive disclosure
    result: RunQueryOutput = await typed.run_query(sql="SELECT 1")
```

The `typed()` adapter is a thin Pydantic wrapper; it is *optional* and lives in a separate import so the base `Acture` class has zero hard dependency on Pydantic.

---

## Consistency check with the journal article

Section 2.1 of the journal article claims "cross-language bindings" as a benefit of the `StableCommand` interface [1]. The MCP-first plan operationalizes that claim using a protocol that already speaks JSON Schema, already supports tool discovery, and is already adopted by every major agent runtime. Section 3.3 specifically calls out MCP server integration [1] — the v1 recommendation makes that integration the *default* surface rather than an alternative. The dispatcher/Provider model of §3 [1] means an MCP adapter is just one more Provider; the registry remains the single source of truth, and Python skill-kit Providers (post-v1) plug into the same model. No architectural reshaping required.

---

## What would break first — failure modes per pattern

- **Pattern (a) MCP.** First break: protocol version drift between TS server (`@modelcontextprotocol/sdk`) and Python client (`mcp` package). Mitigation: pin both to a specific spec date in CI [10]. Second: a Zod refinement is dropped, the agent passes invalid input, and the server-side validator catches it but the agent has no signal in the schema. Mitigation: enforce `.describe()` linting and surface refinement *messages* via JSON Schema `description` text.
- **Pattern (b) JSON-Schema codegen.** First break: a TS author renames a Zod field; CI regenerates `acture_models.py`; Python users on old versions get cryptic validation errors. Mitigation: SemVer the generated package and changelog every regeneration. Second: a Zod transform reshapes the runtime payload such that the Pydantic model no longer matches. Mitigation: assert at codegen time that no command's input schema involves a transform (Zod 4's `.overwrite()` helper [14] is the safe alternative).
- **Pattern (c) OpenAPI.** First break: hand-edited paths drift from the registry [22]. Mitigation: never hand-edit — emit from the registry, fail CI if the spec hash changes without a registry change. Second: operationId collisions when commands share names across namespaces [25]. Mitigation: namespace operationIds by command source.
- **Pattern (d) Direct codegen.** All of (b)'s failure modes, plus dependency on Node tools (`json-schema-to-typescript`, `json2ts`) inside a Python release pipeline [17] — non-trivial CI plumbing. The two codegen graphs (TS→Py and Py→TS) drift independently if not driven from a single script.

---

## Caveats

- I was unable to confirm whether the PyPI name **`acture`** is available; the search tool produced no PyPI page for "acture" but matched the unrelated package `facture` [29]. **Verify before claiming the name** (e.g., `pip index versions acture` or browse `https://pypi.org/project/acture/`).
- MCP is moving fast. The transport story (SSE → streamable HTTP) shifted within 2025, and the spec is date-versioned [10,11]. Any v1 plan should treat MCP protocol upgrades as semver-major events for *acture*.
- The "Zod loses refinements" point is well-documented [3,13,14], but Zod 4's metadata registry (`z.globalRegistry`) is closing some of that gap — track its evolution rather than building a parallel solution.
- I could not invoke the planned `run_blocking_subagent` or `enrich_draft` tools in this environment; the report is built from web search and a fetch of `thorwhalen.com` [19], augmented by the project-knowledge references named in the brief [1,2,3,5,30].

---

## References

[1] Whalen T. *command_dispatch_journal_article.md* — Sections 2.1 (StableCommand interface, cross-language bindings claim) and 3.3 (MCP server integration). Project knowledge.

[2] *ts-json-schema-generator — Generate JSON schema from your TypeScript sources.* Project knowledge ref_43. See also: [vega/ts-json-schema-generator on GitHub](https://github.com/vega/ts-json-schema-generator).

[3] Zod. *JSON Schema conversion (z.toJSONSchema).* [zod.dev/json-schema](https://zod.dev/json-schema); release notes: [zod.dev/v4](https://zod.dev/v4).

[4] Model Context Protocol. *TypeScript SDK — Tool Registration and Execution.* [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk); [DeepWiki: typescript-sdk § Tool Registration](https://deepwiki.com/modelcontextprotocol/typescript-sdk/3.2-tool-registration-and-execution).

[5] *ref_14_mcp-typescript-sdk.md* — MCP TypeScript SDK reference. Project knowledge.

[6] Model Context Protocol. *Python SDK.* [github.com/modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk); [PyPI: mcp](https://pypi.org/project/mcp/).

[7] Lowin J. *FastMCP — The fast, Pythonic way to build MCP servers and clients.* [github.com/jlowin/fastmcp](https://github.com/jlowin/fastmcp); [PyPI: fastmcp](https://pypi.org/project/fastmcp/).

[8] i2mint. *dol — Data Object Layer.* [github.com/i2mint/dol](https://github.com/i2mint/dol); [PyPI: dol](https://pypi.org/project/dol/).

[9] i2mint org overview. [github.com/i2mint](https://github.com/i2mint).

[10] Model Context Protocol Specification. [modelcontextprotocol.io/specification/2025-11-25/basic](https://modelcontextprotocol.io/specification/2025-11-25/basic); spec repository: [github.com/modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol).

[11] Linear. *Linear MCP server — Changelog (May 2025).* [linear.app/changelog/2025-05-01-mcp](https://linear.app/changelog/2025-05-01-mcp).

[12] Anthropic. *Introducing the Model Context Protocol.* [anthropic.com/news/model-context-protocol](https://www.anthropic.com/news/model-context-protocol).

[13] colinhacks/zod issue #5144. *Need help generating JSON Schema with custom branded types in Zod 4.* [github.com/colinhacks/zod/issues/5144](https://github.com/colinhacks/zod/issues/5144).

[14] *ref_42_t-aribart-json-schema-to-ts-infer-typescript-types-from-json-schemas.md.* Project knowledge. See also: Zod v4 release notes — `.transform()` is a black box; `.overwrite()` is the introspectable alternative [3].

[15] Koxudaxi. *datamodel-code-generator.* [github.com/koxudaxi/datamodel-code-generator](https://github.com/koxudaxi/datamodel-code-generator); [Pydantic integration docs](https://docs.pydantic.dev/latest/integrations/datamodel_code_generator/).

[16] openapi-generators. *openapi-python-client.* [github.com/openapi-generators/openapi-python-client](https://github.com/openapi-generators/openapi-python-client).

[17] Dupuis P. *pydantic-to-typescript.* [github.com/phillipdupuis/pydantic-to-typescript](https://github.com/phillipdupuis/pydantic-to-typescript).

[18] Hey API. *@hey-api/openapi-ts — OpenAPI to TypeScript codegen (used by Vercel, OpenCode, PayPal).* [github.com/hey-api/openapi-ts](https://github.com/hey-api/openapi-ts); [heyapi.dev](https://heyapi.dev/).

[19] Whalen T. *Personal site listing 200+ PyPI packages* (`dol`, `meshed`, `qh`, `oa`, `aix`, `cosmograph`, `py2mcp`, `ju`, etc.). [thorwhalen.com](https://thorwhalen.com/); [PyPI: thorwhalen1](https://pypi.org/user/thorwhalen1/); [PyPI: py2mcp](https://pypi.org/project/py2mcp/); [PyPI: ju](https://pypi.org/project/ju/).

[20] Webfuse. *MCP Cheat Sheet (2026) — JSON-RPC 2.0 transport details.* [webfuse.com/mcp-cheat-sheet](https://www.webfuse.com/mcp-cheat-sheet).

[21] Speakeasy. *How to Generate an OpenAPI Document With Pydantic V2.* [speakeasy.com/openapi/frameworks/pydantic](https://www.speakeasy.com/openapi/frameworks/pydantic).

[22] DocSmith / DEV Community. *I stopped manually maintaining OpenAPI specs — here's what I did instead.* [dev.to/docsmith/i-stopped-manually-maintaining-openapi-specs](https://dev.to/docsmith/i-stopped-manually-maintaining-openapi-specs-heres-what-i-did-instead-e3c).

[23] Müllner M. *openapi-python-generator (Pydantic-based).* [github.com/MarcoMuellner/openapi-python-generator](https://github.com/MarcoMuellner/openapi-python-generator).

[24] SitePoint. *MCP Model Context Protocol: Complete Developer Integration Guide* (Node bridge for browser → Python MCP). [sitepoint.com/mcp-model-context-protocol-complete-developer-integration-guide](https://www.sitepoint.com/mcp-model-context-protocol-complete-developer-integration-guide/).

[25] tiangolo. *Generating SDKs — FastAPI docs.* [fastapi.tiangolo.com/advanced/generate-clients/](https://fastapi.tiangolo.com/advanced/generate-clients/).

[26] *ref_45_c-holland-the-schema-language-question-avro-json-schema-protobuf-and-the-quest.md.* Project knowledge — comparative analysis of schema languages including Protobuf vs. JSON Schema vs. Avro.

[27] Speakeasy. *How To Generate an OpenAPI Document With FastAPI.* [speakeasy.com/openapi/frameworks/fastapi](https://www.speakeasy.com/openapi/frameworks/fastapi).

[28] Zhanymkanov. *FastAPI Best Practices.* [github.com/zhanymkanov/fastapi-best-practices](https://github.com/zhanymkanov/fastapi-best-practices).

[29] *facture* (unrelated PyPI package; appears in searches for "acture"). [pypi.org/project/facture/](https://pypi.org/project/facture/).

[30] *ref_05_model-context-protocol-tools-concept.md.* Project knowledge — MCP tools concept overview. See also: [Anthropic skills — Node/TypeScript MCP Server Implementation Guide](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md).