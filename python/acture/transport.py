"""Transport helpers for the acture Python client.

Two transports ship in v1:

- **stdio** — launch an acture MCP server as a subprocess and speak
  JSON-RPC over its stdin/stdout. The common Node-side path: a
  ``node dist/cli.js`` (or any other Node executable that runs an
  ``acture-mcp-server``) is launched, and the Python client connects.
- **http** — connect to a long-running ``acture-mcp-server`` over the
  MCP streamable-HTTP transport.

Both are thin wrappers around the official ``mcp`` Python SDK's
``stdio_client`` and ``streamablehttp_client``. They exist as factories
so :class:`acture.ActureClient` can take a uniform constructor argument
(an async context manager that yields ``(read, write)`` streams).

Per research-6: ``acture-client`` is a thin facade. Transport-level
configuration that the MCP SDK already exposes (env vars, cwd, headers,
auth) flows through the kwargs of these helpers — the client does not
re-invent the configuration surface.
"""

from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager
from typing import TYPE_CHECKING, Any, AsyncIterator, Mapping, Sequence

from mcp import StdioServerParameters
from mcp.client.stdio import stdio_client

if TYPE_CHECKING:
    # The streamable-HTTP transport's exact API surface varies across
    # mcp SDK versions; import it lazily so the package imports cleanly
    # even if the SDK on the host installed a build without HTTP.
    pass


@asynccontextmanager
async def stdio_transport(
    command: str,
    args: Sequence[str] = (),
    *,
    env: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> AsyncIterator[tuple[Any, Any]]:
    """Launch an MCP server over stdio and yield ``(read, write)``.

    Designed to be passed as ``transport=`` to :func:`ActureClient.connect`,
    but usable directly with the ``mcp`` SDK if a caller already has a
    bespoke client loop.

    Args:
        command: executable to launch (e.g. ``"node"``, ``"python"``).
        args: arguments to pass after the executable.
        env: optional environment-variable overrides. Default: inherit.
        cwd: optional working directory for the subprocess.

    Yields:
        A ``(read, write)`` pair of `anyio`-style streams the
        :class:`mcp.ClientSession` constructor expects.
    """
    params = StdioServerParameters(
        command=command,
        args=list(args),
        env=dict(env) if env is not None else None,
        cwd=cwd,
    )
    async with stdio_client(params) as streams:
        yield streams


@asynccontextmanager
async def http_transport(
    url: str,
    *,
    headers: Mapping[str, str] | None = None,
) -> AsyncIterator[tuple[Any, Any]]:
    """Connect to an MCP server over streamable-HTTP and yield ``(read, write)``.

    A thin wrapper over the SDK's ``streamablehttp_client``. Imported
    lazily so the package's base import works even if the host's ``mcp``
    install does not include the HTTP transport (older versions, slimmed
    installs).

    Args:
        url: server URL, including scheme. The MCP spec defines a
             POST-then-stream protocol over a single endpoint; pass
             that endpoint as-is.
        headers: optional HTTP headers (auth bearers, custom routing).

    Yields:
        A ``(read, write)`` pair of streams.
    """
    try:
        from mcp.client.streamable_http import streamablehttp_client
    except ImportError as exc:  # pragma: no cover — depends on SDK build
        raise RuntimeError(
            'acture: HTTP transport not available — the installed `mcp` '
            'package does not expose mcp.client.streamable_http. Upgrade '
            '`mcp` or use `stdio_transport` instead.'
        ) from exc

    async with streamablehttp_client(url, headers=dict(headers) if headers else None) as ctx:
        # streamablehttp_client yields (read, write, get_session_id) in
        # recent SDK builds; older builds yield just (read, write). We
        # only need the streams here — discard the third tuple slot if
        # present.
        if isinstance(ctx, tuple) and len(ctx) >= 2:
            yield ctx[0], ctx[1]
        else:  # pragma: no cover — defensive against future SDK changes
            yield ctx


__all__ = [
    'AsyncExitStack',  # re-exported for convenience in user code
    'stdio_transport',
    'http_transport',
]
