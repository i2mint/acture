---
"acture": patch
---

Cross-language increment: the **Python companion** ships in this release as a thin MCP-client facade.

This npm release carries no source change to `packages/core`; the patch bump drives the `scripts/sync-python-version.mjs` step in the release workflow, which keeps the PyPI `acture` distribution at the same version as the npm one. Starting with this version, PyPI `acture` is **no longer a name-reservation placeholder** — it is the real Python client.

What the Python release adds (PyPI; not in this npm package):

- `ActureClient` — a `Mapping[str, Command]` facade over an `acture-mcp-server` instance. Connect via stdio (subprocess) or streamable HTTP. Tier filtering happens on the server side; the Python client sees what `acture-mcp-server` published.
- `Command` — a callable: `await client['cmd.id'](**params)` returns `structuredContent`; `call_raw` returns the raw `CallToolResult`. Schemas exposed as `command.input_schema` for downstream Pydantic codegen by the host project if desired.
- `ActureError` — errors-as-data across the language boundary. A TS dispatch's `{ ok: false, error }` arrives as a typed exception with `code`, `message`, `command_id`, `details`.
- Helpers: `acture.stdio_transport`, `acture.http_transport` — async context managers yielding `(read, write)` streams; a custom transport (in-memory channel, WebSocket bridge) just needs the same shape.

Out of scope for v1 (per `docs/research/acture_research_6`): Pydantic-codegen SDK, OpenAPI emitter, CLI shim, inverse-direction skill kit. Each is post-v1 if real demand surfaces.

Cross-language semver is in lockstep with the npm `acture` package by the existing `scripts/sync-python-version.mjs` convention; loosening that is a future decision, deliberately not made in this increment.

Reference: `docs/hand-written-python-client.md` (~50 lines). Consumer skill: `acture-python`.
