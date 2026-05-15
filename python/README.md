# acture (Python)

> **acture is a development tool first.** This Python package is an *optional accelerator* — an agent can hand-write the same client into your project instead, with no `acture` Python dependency. Installing it is a deliberate, opt-in choice to reuse a tested facade rather than own it. See [`docs/positioning.md`](https://github.com/thorwhalen/acture/blob/main/docs/positioning.md) and [`docs/hand-written-python-client.md`](https://github.com/thorwhalen/acture/blob/main/docs/hand-written-python-client.md).

The acture library itself is a TypeScript / JavaScript package on npm (https://www.npmjs.com/package/acture); the server side ships as [`acture-mcp-server`](https://www.npmjs.com/package/acture-mcp-server). **This Python package is a thin client** that consumes any `acture-mcp-server` instance the same way an LLM agent would — via the [Model Context Protocol](https://modelcontextprotocol.io/).

## Install

```sh
pip install acture
```

Requires Python ≥ 3.10. Brings one runtime dependency: the official `mcp` SDK (≥ 1.10).

## Use

```python
import asyncio
from acture import ActureClient

async def main():
    async with ActureClient.from_stdio(['node', 'dist/cli.js']) as client:
        # Dict-like over the command registry
        print(list(client))                       # ['app.foo', 'app.bar', ...]
        print(len(client))                        # 2
        print(client['app.foo'].description)

        # Call a command
        result = await client['app.foo'](text='hi')
        print(result)                             # the dispatch's structuredContent

asyncio.run(main())
```

`ActureClient` is a `Mapping[str, Command]`. The dict-like surface mirrors `dol` and `py2mcp` conventions.

## Errors as data

A failed dispatch on the TypeScript side (`{ ok: false, error: { code, message } }`) arrives in Python as a typed exception:

```python
from acture import ActureError

try:
    await client['app.may_fail'](x=1)
except ActureError as e:
    print(e.code, e.message, e.details)   # e.command_id == 'app.may_fail'
```

If you want the raw `CallToolResult` instead — without an exception — use `call_raw`:

```python
result = await client['app.may_fail'].call_raw(x=1)
if result.isError:
    print('failed:', result.content)
else:
    print('ok:', result.structuredContent)
```

## Transports

Two transports bundled out of the box:

```python
# stdio — launch the server as a subprocess
async with ActureClient.from_stdio(['node', 'dist/cli.js']) as client:
    ...

# streamable HTTP — connect to a long-running server
async with ActureClient.from_http('http://localhost:9000/mcp') as client:
    ...
```

For an in-memory channel (tests), a WebSocket bridge, or any other transport, pass an async context manager yielding `(read, write)` streams to `ActureClient.connect(transport=...)`. The bundled helpers (`acture.stdio_transport`, `acture.http_transport`) are the reference shapes.

## What's intentionally *not* in v1

Per [`acture_research_6`](https://github.com/thorwhalen/acture/blob/main/docs/research/acture_research_6%20--%20Cross-Language%20Story%20for%20acture%20(TypeScript%20and%20Python).md) §"v1 scope":

- **No Pydantic-codegen SDK.** Pydantic adds no value for agents — they read JSON Schema + descriptions. Human users who want typed models can run `datamodel-code-generator` over each tool's `inputSchema` themselves; that is post-v1 work and out of scope for the thin facade.
- **No OpenAPI emitter.** OpenAPI imposes REST semantics on a function-call protocol; MCP already speaks JSON Schema. Adding a second wire would double the surface area without serving agents.
- **No hard dependency on `pydantic`, `httpx`, or any framework.** The package is `mcp`-only; the `mcp` SDK brings what it needs.

Both are post-v1 candidates; pull-forward decisions are the user's.

## Tier filtering

Tier filtering happens **on the server side**. The Python client sees whatever `acture-mcp-server` published — typically `tier: 'stable'` only. To see experimental commands, configure the server-side `tiers` option, not the client.

## See also

- [`docs/hand-written-python-client.md`](https://github.com/thorwhalen/acture/blob/main/docs/hand-written-python-client.md) — the ~50-line agent-written equivalent.
- [`acture-mcp-server`](https://www.npmjs.com/package/acture-mcp-server) — the npm package this client talks to.
- [Model Context Protocol](https://modelcontextprotocol.io/) — the wire protocol.
- [`acture` on GitHub](https://github.com/thorwhalen/acture) — the full ecosystem (TypeScript core, adapters, skills).

## License

Apache-2.0.
