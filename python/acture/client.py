"""``ActureClient`` — a dict-like facade over an acture MCP server.

The Python companion is deliberately thin (per research-6 §"v1 scope"):
it wraps an ``mcp.ClientSession`` in a ``Mapping[str, Command]`` so
calling a command on the TS side feels like ``client['app.foo'](**params)``
on the Python side. Per ``dol`` / ``py2mcp`` idioms, the dict-like
surface is the front door.

Two transports out of the box: stdio (subprocess) and streamable-HTTP.
A user with a custom transport (an in-memory channel for tests, a
WebSocket bridge for browser embedding) passes their own async context
manager via ``transport=``.

Errors-as-data is preserved at the boundary:

- ``await client['cmd.id'](x=1)`` — raises :class:`ActureError` on
  ``{ isError: true }``. The convenient form.
- ``await client['cmd.id'].call_raw(x=1)`` — returns the raw
  ``CallToolResult`` dict (``isError``, ``content``, ``structuredContent``).
  For callers who want the dict form.

The package does NOT depend on Pydantic. A typed-models layer (e.g.
``datamodel-code-generator`` over ``tools/list`` schemas) is an
optional, post-v1 add-on — out of scope for the thin v1 facade.
"""

from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager
from typing import (
    Any,
    AsyncContextManager,
    AsyncIterator,
    Awaitable,
    Callable,
    Iterator,
    Mapping,
    Sequence,
)

from mcp import ClientSession
from mcp.types import CallToolResult, ListToolsResult, Tool

from .transport import http_transport, stdio_transport
from .types import ActureError

# Transport type: an async context manager that yields ``(read, write)``
# streams the mcp.ClientSession expects. Both `stdio_transport(...)` and
# `http_transport(...)` produce one; user-supplied transports must
# match the same shape.
Transport = AsyncContextManager[tuple[Any, Any]]


class Command:
    """A bound, callable command projected from the MCP server.

    Instances are created by :class:`ActureClient.__getitem__`. They
    are intentionally thin: a name, the tool descriptor (input schema,
    description) frozen at ``tools/list`` time, and a back-reference
    to the live :class:`ClientSession`.

    Treat a ``Command`` like a callable:

    .. code-block:: python

        result = await client['app.zoom.fit']()
        result = await client['app.echo'](text='hi')
        raw    = await client['app.echo'].call_raw(text='hi')
    """

    __slots__ = ('_name', '_meta', '_session')

    def __init__(self, name: str, meta: Mapping[str, Any], session: ClientSession) -> None:
        self._name = name
        self._meta = dict(meta)
        self._session = session

    @property
    def name(self) -> str:
        """Command id — the same string the TS registry registered."""
        return self._name

    @property
    def description(self) -> str | None:
        """Free-text description, exactly as the MCP server advertised
        it. ``@deprecated`` commands carry a ``[DEPRECATED — ...]``
        prefix per ``acture-mcp-server``'s banner convention."""
        return self._meta.get('description')

    @property
    def input_schema(self) -> Mapping[str, Any]:
        """JSON Schema for the command's input parameters.

        For commands with no params, this is
        ``{type: 'object', properties: {}, additionalProperties: false}``
        — the JSON-Schema way of saying "no parameters".
        """
        # The MCP SDK exposes the field as `inputSchema` on the Tool
        # model; pulling from the dump preserves that name. Callers who
        # want a `pydantic` model can import `mcp.types.Tool` directly.
        return self._meta.get('inputSchema', {})

    async def __call__(self, **arguments: Any) -> Any:
        """Dispatch the command and return ``structuredContent`` on
        success, raise :class:`ActureError` on failure.

        Equivalent to ``await client._session.call_tool(name, arguments)``
        followed by errors-as-data unwrapping. Use :meth:`call_raw` if
        you need the full ``CallToolResult`` dict.
        """
        result = await self._session.call_tool(self._name, arguments=arguments or None)
        return _unwrap_result(self._name, result)

    async def call_raw(self, **arguments: Any) -> CallToolResult:
        """Dispatch the command and return the full ``CallToolResult``.

        Use when you need the raw error payload, the unstructured
        ``content`` blocks, or both. Does NOT raise on ``isError``.
        """
        return await self._session.call_tool(self._name, arguments=arguments or None)

    def __repr__(self) -> str:
        suffix = f' — {self.description!r}' if self.description else ''
        return f'<acture.Command {self._name!r}{suffix}>'


class ActureClient(Mapping[str, Command]):
    """Dict-like facade over an acture MCP server.

    Usage:

    .. code-block:: python

        async with ActureClient.from_stdio(['node', 'dist/cli.js']) as client:
            print(list(client))                  # ['app.foo', 'app.bar', ...]
            print(len(client))                   # 2
            print(client['app.foo'].input_schema)
            result = await client['app.foo'](x=1)

    The ``tools/list`` response is cached at connect time. If the
    server emits ``notifications/tools/list_changed`` (commands graduated,
    deprecated, or registered after connect), call :meth:`refresh` to
    re-read the list.

    Tier filtering happens **on the server side** — the
    :class:`acture-mcp-server` projects only commands whose tier matches
    its configured filter (default ``stable``). The Python client sees
    what the server publishes; it does not re-filter.
    """

    def __init__(self, session: ClientSession, tools: Mapping[str, Mapping[str, Any]]) -> None:
        self._session = session
        # Frozen at construction. `refresh()` rebuilds it.
        self._tools: dict[str, dict[str, Any]] = {name: dict(meta) for name, meta in tools.items()}

    # ── Construction ────────────────────────────────────────────────

    @classmethod
    def connect(
        cls,
        transport: Transport | Callable[[], Transport],
    ) -> AsyncContextManager['ActureClient']:
        """Connect via any MCP transport — generic form.

        ``transport`` is an async context manager (or a zero-arg factory
        returning one) that yields ``(read, write)`` streams. Use
        :func:`acture.stdio_transport` or :func:`acture.http_transport`
        for the bundled ones.

        Returns an async context manager. Inside the ``async with`` block
        the client is connected; on exit, the transport and session are
        cleanly shut down.
        """
        return _connect(transport)

    @classmethod
    def from_stdio(
        cls,
        argv: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        cwd: str | None = None,
    ) -> AsyncContextManager['ActureClient']:
        """Launch an acture MCP server as a subprocess and connect.

        Args:
            argv: command + arguments (e.g. ``['node', 'dist/cli.js']``).
                  Must be non-empty.
            env: optional env-var overrides for the subprocess.
            cwd: optional working directory.
        """
        if not argv:
            raise ValueError('from_stdio: argv must be non-empty')
        return _connect(
            lambda: stdio_transport(argv[0], argv[1:], env=env, cwd=cwd),
        )

    @classmethod
    def from_http(
        cls,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
    ) -> AsyncContextManager['ActureClient']:
        """Connect to a long-running acture MCP server over HTTP."""
        return _connect(lambda: http_transport(url, headers=headers))

    # ── Mapping protocol ────────────────────────────────────────────

    def __getitem__(self, name: str) -> Command:
        if name not in self._tools:
            raise KeyError(name)
        return Command(name, self._tools[name], self._session)

    def __iter__(self) -> Iterator[str]:
        return iter(self._tools)

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: object) -> bool:
        return name in self._tools

    # ── Live operations ─────────────────────────────────────────────

    async def refresh(self) -> None:
        """Re-read ``tools/list`` from the server.

        Call after the server sends ``notifications/tools/list_changed``,
        or whenever the client's cached view of available commands is
        suspected to be stale.
        """
        listing = await self._session.list_tools()
        self._tools = _tools_to_dict(listing)

    @property
    def session(self) -> ClientSession:
        """The underlying :class:`mcp.ClientSession`.

        Exposed for callers that need MCP features the facade does not
        wrap (subscriptions, resource reads, sampling). Use sparingly —
        the facade is the supported surface.
        """
        return self._session

    def __repr__(self) -> str:
        return f'<ActureClient — {len(self._tools)} commands: {sorted(self._tools)!r}>'


# ── Internal helpers ────────────────────────────────────────────────


def _tools_to_dict(listing: ListToolsResult) -> dict[str, dict[str, Any]]:
    """Convert a `ListToolsResult` into a `{name: meta}` map, with
    None-valued keys dropped so the cache stays small."""
    out: dict[str, dict[str, Any]] = {}
    for tool in listing.tools:
        dumped = tool.model_dump(exclude_none=True)
        # `name` is the key; keep it inside the meta dict too for
        # symmetry with Tool.model_dump's output (callers may want it).
        out[tool.name] = dumped
    return out


def _unwrap_result(name: str, result: CallToolResult) -> Any:
    """Convert a `CallToolResult` into the structured content, raising
    `ActureError` if `isError: true`.

    For acture-served tools, a successful dispatch arrives with
    `structuredContent` set to the registered command's result value
    (per `acture-mcp-server`'s `formatToolResponse`). For SDK
    compatibility with non-acture servers, the fallback returns the
    `content` list verbatim.
    """
    if result.isError:
        # `acture-mcp-server` packages errors into `content` as a text
        # block whose payload is the JSON-stringified `CommandError`.
        # Try to parse it; if that fails, surface a generic error.
        code, message, details = _parse_error_payload(result)
        raise ActureError(code, message, command_id=name, details=details)
    if result.structuredContent is not None:
        return result.structuredContent
    # No structured content — return the content blocks as-is so the
    # caller can decide how to interpret them. Tools that return only
    # text fall into this branch.
    return [block.model_dump(exclude_none=True) for block in result.content]


def _parse_error_payload(result: CallToolResult) -> tuple[str, str, Any]:
    """Best-effort extraction of (code, message, details) from an
    error result. Tolerates servers that don't speak acture's shape."""
    import json

    for block in result.content:
        if getattr(block, 'type', None) != 'text':
            continue
        text = getattr(block, 'text', '')
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, dict):
            code = parsed.get('code')
            message = parsed.get('message')
            if isinstance(code, str) and isinstance(message, str):
                return code, message, parsed.get('details')
    # Fallback: use the first text block's content as the message,
    # tagged with a generic code so callers can still branch on it.
    for block in result.content:
        if getattr(block, 'type', None) == 'text':
            text = getattr(block, 'text', '') or ''
            return 'tool_error', text or 'tool call returned isError', None
    return 'tool_error', 'tool call returned isError', None


@asynccontextmanager
async def _connect(
    transport: Transport | Callable[[], Transport],
) -> AsyncIterator[ActureClient]:
    """Shared connect-and-initialize machinery used by every
    ``from_*`` constructor."""
    async with AsyncExitStack() as stack:
        tx = transport() if callable(transport) else transport
        streams = await stack.enter_async_context(tx)
        # Some SDK builds yield a 3-tuple `(read, write, get_session_id)`
        # from streamable-HTTP. Accept either shape.
        if isinstance(streams, tuple) and len(streams) >= 2:
            read, write = streams[0], streams[1]
        else:  # pragma: no cover — defensive against future SDK changes
            raise TypeError(f'acture: unexpected transport tuple shape: {streams!r}')
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        listing = await session.list_tools()
        yield ActureClient(session, _tools_to_dict(listing))


__all__ = ['ActureClient', 'Command']
