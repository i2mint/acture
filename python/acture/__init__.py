"""acture — Python client for an acture MCP server.

A thin, dict-like facade over the official ``mcp`` Python SDK. The
acture library itself lives on npm (https://www.npmjs.com/package/acture)
as a TypeScript / JavaScript package; this Python distribution lets a
Python program *consume* an ``acture-mcp-server`` instance the same
way an LLM agent would — via the Model Context Protocol.

Quickstart:

.. code-block:: python

    import asyncio
    from acture import ActureClient

    async def main():
        async with ActureClient.from_stdio(['node', 'dist/cli.js']) as client:
            print(list(client))                  # tool names
            print(client['app.foo'].description)
            result = await client['app.foo'](text='hi')

    asyncio.run(main())

The package is **dict-like in the dol/py2mcp idiom**: a connected
``ActureClient`` is a ``Mapping[str, Command]``. ``iter(client)`` yields
known command ids, ``len(client)`` counts them, ``client['cmd.id']``
returns a callable :class:`Command`.

**Errors-as-data is preserved** at the MCP boundary. Calling a command
the convenient way (``await client['cmd'](**params)``) raises
:class:`ActureError` on ``isError`` results; calling ``call_raw`` returns
the full ``CallToolResult`` dict for users who want to branch on the
shape themselves.

The package is intentionally **thin** — no Pydantic dependency, no
codegen, no opinions about the host's async runtime. A typed-models
layer (``datamodel-code-generator`` over ``tools/list`` schemas) is
optional post-v1 work.
"""

from __future__ import annotations

from .client import ActureClient, Command
from .transport import http_transport, stdio_transport
from .types import ActureError

__all__ = [
    'ActureClient',
    'ActureError',
    'Command',
    'http_transport',
    'stdio_transport',
    '__version__',
]

__version__ = "1.2.1"
"""Version. Auto-synced to the npm ``acture`` package's version by
``scripts/sync-python-version.mjs`` at release time. Cross-language
lockstep is the suite's existing convention; loosen it only with a
deliberate, documented decision."""
