---
name: acture-python
description: Build a Python consumer for an acture-mcp-server — a dict-like facade over the Model Context Protocol so Python code can dispatch commands the same way an LLM agent would. Covers the SDK choice (mcp / FastMCP / hand-rolled JSON-RPC), the agent-written vs `acture` (PyPI) package paths, the dict-like Mapping[str, Command] idiom, errors-as-data preservation across the language boundary, the stdio vs streamable-HTTP transport choice, and why a Pydantic-codegen layer is deliberately post-v1. Use when a Python program needs to call commands hosted by an acture-mcp-server, or when working ON the `acture` Python package. Triggers on "Python client", "call acture from Python", "MCP client", "Python facade", "py2mcp", "Python companion".
---

# acture python — calling acture-mcp-server from Python

The Python companion is **a thin MCP client**, not a parallel implementation of acture. It speaks the same wire (MCP / JSON-RPC 2.0 / JSON Schema 2020-12) every LLM agent does. There is no Python core — there is the npm `acture` core plus the `acture-mcp-server` projection, and Python is one more consumer of that projection. The Python package's job is to make calling those projected commands feel like Python: dict-like, awaitable, errors-as-typed-exceptions.

> **Load `acture-consumer-integration` first.** Python-consumption is a consumer surface — this skill covers Python specifics; the foundational pattern (the dev-tool-first rule, the per-consumer hand-write-vs-install choice, the tool-library-is-the-user's-choice rule) lives there.

## Two decisions to surface (per `acture-consumer-integration`)

### Decision 1 — the MCP SDK (the tool-library choice — the user's)

Python MCP consumption rests on an SDK. Realistic choices: the **official `mcp` SDK** (`pip install mcp`, from Anthropic / the MCP project) — the path of least resistance, what the `acture` Python package binds to. **`FastMCP`** — a higher-level Pythonic wrapper around `mcp` (originally a separate project, now folded into the official SDK as `mcp.server.fastmcp`). **A hand-rolled JSON-RPC client** — workable but loses streaming, retries, transport reconnects, and structuredContent normalization that the SDK handles for you. **`mcp` is the user's likely choice**; ship one binding only.

### Decision 2 — agent-written vs package-reuse

- **Agent-written** — write the facade directly into the project: a small `Mapping[str, Command]` wrapper over `mcp.ClientSession`, an `ActureError` exception, a `from_stdio` factory. ~50 lines, owned, one dependency (`mcp`). The reproducible reference is [`docs/hand-written-python-client.md`](../../../docs/hand-written-python-client.md) — adapt it directly.
- **Package-reuse** — `pip install acture`. Exports `ActureClient`, `Command`, `ActureError`, `stdio_transport`, `http_transport`. Cost: a Python dependency to track. The shapes match the hand-written reference.

Surface both; follow a stated preference if one exists; otherwise ask. Record the choice in the project's adoption notes (`acture-consumer-integration` §Step 4).

## The build — what every path produces, and what to get right

Whatever SDK and path, the Python client must honour these — they are what makes Python a faithful consumer projection, not a parallel system:

- **The client is `Mapping[str, Command]`.** `iter(client)` yields known command ids; `len(client)` counts them; `client['cmd.id']` returns a callable. This is the `dol` / `py2mcp` idiom acture's research-6 commits to. Resist the urge to invent a different surface (a class with `.dispatch(name, ...)`, a generated SDK with one method per command). The dict-like surface is the front door for a reason: it makes new commands automatically available (no codegen step in the loop) and matches how MCP itself models tool discovery.
- **Tools are fetched at connect time, cached, and refreshable.** `tools/list` is called inside the connection setup; the result becomes `client._tools`. Servers that emit `notifications/tools/list_changed` (per the MCP spec) signal a refresh — `client.refresh()` re-reads. Live re-fetching on every call would multiply the wire roundtrips and defeat the dict-like cache.
- **Errors-as-data is preserved across the language boundary.** A TS dispatch that returns `{ ok: false, error: { code, message } }` is packaged by `acture-mcp-server`'s `formatToolResponse` as an MCP result with `isError: true` and the JSON-stringified `CommandError` in a text content block. The Python client unwraps this into an `ActureError(code, message, command_id, details)`. Callers who want the raw dict use `call_raw`. Re-shaping the error into a Python `dict` with different field names is the inner-platform temptation (hard-don't #1).
- **Tier filtering happens on the server side.** The Python client sees what the server published. Don't add a `tiers=` filter on the client constructor — that would imply two filters disagree, and the server's is authoritative.
- **No hard Pydantic dependency.** The `mcp` SDK uses Pydantic internally, but acture's Python facade doesn't import `pydantic` directly. A typed-models layer (e.g. `datamodel-code-generator` over each tool's `inputSchema`) is *optional, post-v1*, and lives in the host project — not in this facade. Adding `pydantic` as a hard dep would also force every Python consumer to track Pydantic's major-version churn (`v1` → `v2`), which is not the agent-style consumer's problem.
- **Transport choice is the host's.** stdio for subprocess setups, streamable-HTTP for long-running servers, in-memory streams for tests, a WebSocket bridge for browser embedding — the facade accepts any async context manager yielding `(read, write)` streams. Bundle the common two (`stdio_transport`, `http_transport`) and let the user pass their own otherwise.
- **The version tracks npm `acture`'s.** The repo's `scripts/sync-python-version.mjs` keeps `python/acture/__init__.py`'s `__version__` synced with `packages/core/package.json`'s version at release time. Lockstep is the existing convention; loosening it is a deliberate, documented future decision — not something to invent in passing.

## When working ON the `acture` Python package

The same positioning applies inward (per `acture-consumer-integration` §"When you are working ON a consumer-specific package"):

- The package **translates** the MCP wire into a Pythonic facade; it does not *decide* what commands are correct, what their semantics are, or what the host should do with results (hard-don't #3). The TS side owns the registry.
- **One MCP SDK binding only — `mcp`.** Don't bundle a Pydantic-codegen helper; don't bundle a FastAPI shim; don't bundle a CLI wrapper. Each is its own future package if real demand surfaces (hard-don't #2: no god-package).
- **No Pydantic dependency.** If a host wants typed models, they run `datamodel-code-generator` themselves — the package's `Command.input_schema` already exposes the raw JSON Schema for that pipeline.
- **Match the npm side's shape language.** A TS command's `description`, `inputSchema`, `id` survive the trip across MCP. Don't translate them ("name → command_name"); the Python surface is the same surface.
- **Cross-language semver is lockstep, today.** The placeholder package that previously occupied this PyPI slot established this convention via `sync-python-version.mjs`. Decoupling is a future option, but the v1 facade is small enough that lockstep is harmless — and breaking lockstep silently will confuse users who expect npm `acture@X.Y.Z` and PyPI `acture==X.Y.Z` to be the same release artifact.
- **The hand-written reference doc is the source of truth for the supported subset.** `docs/hand-written-python-client.md` shows the ~50-line equivalent; if the package's API drifts from those shapes, fix the package or the doc, not just one. The faithfulness commitment matches `hand-written-registry.md` / `hand-written-command-sequence.md` / `hand-written-telemetry.md` / `hand-written-undo.md` / `hand-written-test-property.md`.

## What NOT to build (wait for a real need)

- **No Pydantic-codegen SDK** (`acture-models`). Agents read JSON Schema directly; Python humans who want typed models can run `datamodel-code-generator` over each tool's `inputSchema` themselves. Pulling this into the facade would (a) force a Pydantic-version constraint on every consumer, (b) double the release-pipeline surface, and (c) couple the Python package's release cadence to a generated artifact's regen schedule. Out of scope for v1.
- **No OpenAPI emitter.** OpenAPI imposes REST semantics on a function-call protocol; MCP already speaks JSON Schema. Adding a second wire would double the surface area without serving agents.
- **No CLI shim.** `argh` / `click` / `argparse` compose cleanly with the dict-like surface; the host writes the CLI wiring it needs.
- **No async-only sampling, subscriptions, resource reads** in the facade. Those are MCP features beyond the tool-call dispatch loop; expose `client.session` so callers can reach them, and add per-feature helpers only when real demand surfaces.
- **No `acture-skills`-style inverse direction in v1** (Python authors registering commands that acture surfaces back through the same MCP endpoint). Post-v1 work per research-6; surface as a fresh option after v1 stabilises.

## See also

- `acture-consumer-integration` — the foundational consumer pattern this builds on.
- [`docs/hand-written-python-client.md`](../../../docs/hand-written-python-client.md) — the ~50-line agent-written equivalent.
- `acture-mcp` — the *server*-side companion skill (the TS side projects the registry as an MCP server; this client consumes it).
- `acture-schema-bridge` — the Zod-to-JSON-Schema projection; the Python client sees the same projected schemas via `tool.inputSchema`.
- `acture-tier-system` — tier filtering happens on the server side; the Python client receives the filtered list.
- [`docs/research/acture_research_6 -- Cross-Language Story for acture (TypeScript and Python).md`](../../../docs/research/acture_research_6%20--%20Cross-Language%20Story%20for%20acture%20%28TypeScript%20and%20Python%29.md) — the spec this client implements.
- [Model Context Protocol](https://modelcontextprotocol.io/) — the wire protocol.
- [`mcp` on PyPI](https://pypi.org/project/mcp/) — the official Python SDK this client binds to.
