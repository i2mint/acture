# The hand-written Python client — a reproducible reference

**Status:** reference artifact. This document makes acture's
dev-tool-first promise *true in the code* for the **Python consumer**
surface: a developer can call an `acture-mcp-server` from Python with
**zero `acture` Python dependency** by hand-writing the ~50-line client
below.

Read [`docs/positioning.md`](positioning.md) first — it is canonical. The
sibling references — [`hand-written-registry.md`](hand-written-registry.md),
[`hand-written-command-sequence.md`](hand-written-command-sequence.md),
[`hand-written-telemetry.md`](hand-written-telemetry.md),
[`hand-written-undo.md`](hand-written-undo.md),
[`hand-written-test-property.md`](hand-written-test-property.md) — all
follow the same pattern.

---

## When to hand-write vs. install `acture` (the Python package)

| | Hand-write (this doc) | `pip install acture` |
| --- | --- | --- |
| Dependencies added | one (`mcp`) | two (`acture`, `mcp`) |
| Code the team owns | ~50 lines, in their repo | the import surface |
| Errors-as-data preserved | yes | yes |
| Dict-like facade | the team writes it | imported |
| Transport choice (stdio / HTTP / custom) | hand-write the helper | bundled |
| Maintenance | the team's | acture's |

Hand-writing is the right call when the project wants the MCP facade
without an extra dependency — a small command set, a one-shot script,
or a team that prefers to own every line. Installing the `acture`
Python package is the right call when the team wants the tested facade
(error unwrapping, transport helpers, dict-like surface) without
re-deriving it. **It is a per-project trade, made deliberately — never
a default.**

The two paths are compatible: the shapes below are deliberately the
shapes the `acture` package exports, so swapping later is mechanical.

---

## The minimal Python client

This is a complete, self-contained `acture-mcp-server` client. Copy
it into the target project (e.g. `acture_client.py`), adapt the names,
delete what the project doesn't need. The only dependency is the
official `mcp` SDK.

```python
"""acture_client.py — minimal MCP client for an acture-mcp-server."""
from __future__ import annotations

import json
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any, AsyncIterator, Iterator, Mapping

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class ActureError(Exception):
    """Raised when a dispatch returns `isError: true`."""
    def __init__(self, code: str, message: str, *, command_id: str | None = None, details: Any = None):
        super().__init__(f'{code}: {message}' if message else code)
        self.code, self.message, self.command_id, self.details = code, message, command_id, details


class Command:
    """A bound command — the result of `client['cmd.id']`."""
    def __init__(self, name: str, meta: dict, session: ClientSession):
        self._name, self._meta, self._session = name, meta, session

    @property
    def name(self) -> str: return self._name
    @property
    def description(self) -> str | None: return self._meta.get('description')
    @property
    def input_schema(self) -> dict: return self._meta.get('inputSchema', {})

    async def __call__(self, **arguments: Any) -> Any:
        result = await self._session.call_tool(self._name, arguments=arguments or None)
        if result.isError:
            code, message, details = _parse_error(result)
            raise ActureError(code, message, command_id=self._name, details=details)
        if result.structuredContent is not None:
            return result.structuredContent
        return [b.model_dump(exclude_none=True) for b in result.content]


class ActureClient(Mapping[str, Command]):
    """Dict-like facade over an acture-mcp-server."""

    def __init__(self, session: ClientSession, tools: dict[str, dict]):
        self._session, self._tools = session, tools

    @classmethod
    @asynccontextmanager
    async def from_stdio(cls, argv: list[str]) -> AsyncIterator['ActureClient']:
        params = StdioServerParameters(command=argv[0], args=argv[1:])
        async with AsyncExitStack() as stack:
            read, write = await stack.enter_async_context(stdio_client(params))
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
            listing = await session.list_tools()
            tools = {t.name: t.model_dump(exclude_none=True) for t in listing.tools}
            yield cls(session, tools)

    # Mapping protocol — dol/py2mcp style.
    def __iter__(self) -> Iterator[str]: return iter(self._tools)
    def __len__(self) -> int: return len(self._tools)
    def __getitem__(self, k: str) -> Command:
        if k not in self._tools: raise KeyError(k)
        return Command(k, self._tools[k], self._session)


def _parse_error(result) -> tuple[str, str, Any]:
    """Best-effort extraction of (code, message, details) from an
    acture-mcp-server error result. The error payload is a single
    text block with the JSON-stringified CommandError."""
    for block in result.content:
        if getattr(block, 'type', None) != 'text': continue
        try: parsed = json.loads(block.text)
        except (ValueError, TypeError): continue
        if isinstance(parsed, dict) and isinstance(parsed.get('code'), str):
            return parsed['code'], parsed.get('message', ''), parsed.get('details')
    return 'tool_error', 'tool returned isError', None
```

That's the whole client. Add `from_http` (mirroring `from_stdio` but
using `mcp.client.streamable_http.streamablehttp_client`) when the
project needs the HTTP transport.

---

## Why each piece is shaped this way

- **The client is `Mapping[str, Command]`, not a generated SDK.** Agents
  read JSON Schema and descriptions; they do not need typed Python
  models. Humans who *do* want typed models can run
  `datamodel-code-generator` over the `tools/list` response and import
  the generated module separately — that is post-v1 work and lives in
  the host project, not in this facade.
- **Errors-as-data is preserved at the boundary.** A TS dispatch that
  returns `{ ok: false, error: { code, message } }` arrives in
  Python as a typed exception. Callers who want the dict form (for
  branching without try/except) use `Command.call_raw`.
- **The dict-like facade is the front door — not the only door.** The
  raw `ClientSession` is reachable through `client.session` (the
  package version exposes it; the hand-written one above can add it
  trivially). Use it for MCP features the facade doesn't wrap
  (subscriptions, resource reads).
- **No Pydantic dependency.** The `mcp` SDK has its own internal use
  of Pydantic, but `acture_client.py` itself does not import it. A
  Python consumer who chooses to layer Pydantic models on top does so
  in their own code, on their own schedule.
- **Tier filtering happens on the server side.** The Python client
  sees what `acture-mcp-server` published (typically `tier: 'stable'`).
  Adding a Python-side filter would mean teaching the client what a
  "tier" is — that crosses the translate-don't-decide line.

---

## What this reference deliberately omits

YAGNI applied softly — add these only when a real need appears in your
project:

- **A Pydantic-codegen step.** Optional post-v1 work; run
  `datamodel-code-generator` over `tools/list` JSON Schemas yourself,
  in your own build, when you actually need typed models.
- **A FastAPI shim.** OpenAPI emission belongs in your application
  layer if you serve a human UI; it does not belong in the agent-facing
  facade.
- **A subscription / streaming API.** MCP supports it; surface it
  through `client.session` when you need it. Don't bake it into the
  facade until a real caller asks.
- **Argparse / CLI shim.** Dispatching commands to a CLI is the host's
  call. The dict-like surface composes cleanly with `argparse`, `argh`,
  `click`, or whatever the host already uses.

---

## Faithfulness note

The shapes here are deliberately the shapes the `acture` Python
package exports — `ActureClient`, `Command`, `ActureError`,
`from_stdio`, `from_http`, the `Mapping[str, Command]` protocol. An
agent that hand-writes from this doc and later installs the package
finds the migration mechanical. If the package's contract changes,
this doc changes with it.

## See also

- [`docs/positioning.md`](positioning.md) — canonical; the dev-tool-first principle.
- `acture-python` skill — walks an agent through using this reference vs. installing the package.
- `acture-mcp` skill — the *server*-side companion (the TS side projects the registry as an MCP server; this client consumes it).
- [`docs/research/acture_research_6 -- Cross-Language Story for acture (TypeScript and Python).md`](research/acture_research_6%20--%20Cross-Language%20Story%20for%20acture%20%28TypeScript%20and%20Python%29.md) — the spec this client implements.
- [Model Context Protocol](https://modelcontextprotocol.io/) — the wire protocol.
