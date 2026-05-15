"""Test fixtures — an in-memory MCP server that mimics
``acture-mcp-server``'s ``tools/list`` and ``tools/call`` shape, plus
a helper that yields an ``ActureClient`` connected to it.

Using the SDK's in-memory transport (``create_connected_server_and_client_session``)
instead of a real subprocess keeps tests fast and dependency-free —
no Node, no built JS bundle, no flaky stdio.

The async fixtures use a per-test event-loop (the pytest-asyncio
``loop_scope="function"`` default in 1.x) and the SDK's anyio-backed
streams. Tests use the ``echo_server`` factory to set up + tear down
the connected client inside a single async function, side-stepping the
classic "cancel scope exited in a different task" trap that arises
when an anyio context manager is opened in one task and closed in
another (the fixture teardown path).
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable

import pytest
from mcp.server import Server
from mcp.shared.memory import create_connected_server_and_client_session
from mcp.types import CallToolResult, TextContent, Tool

from acture import ActureClient
from acture.client import _tools_to_dict  # type: ignore[attr-defined]


def make_acture_like_server(
    *,
    tools: list[Tool],
    handler: Callable[[str, dict[str, Any]], dict[str, Any]],
) -> Server:
    """Build an in-memory MCP `Server` that lists `tools` and routes
    each `tools/call` to `handler(name, args) -> result_dict`.

    Result shapes:
        - ``{'value': anything}`` → success: structuredContent is set.
        - ``{'error': {'code', 'message', 'details?'}}`` → packaged as
          ``acture-mcp-server`` packages errors: a single text content
          block whose body is the JSON-stringified ``CommandError``,
          plus ``isError=True``. This mirrors ``formatToolResponse``.
    """
    server: Server = Server('acture-mcp-server-test')

    @server.list_tools()
    async def _list_tools() -> list[Tool]:
        return tools

    @server.call_tool()
    async def _call_tool(name: str, arguments: dict[str, Any]) -> Any:
        result = handler(name, arguments)
        if 'error' in result:
            err = result['error']
            return CallToolResult(
                content=[TextContent(type='text', text=json.dumps(err))],
                isError=True,
            )
        value = result['value']
        structured = value if isinstance(value, dict) else {'value': value}
        return (
            [TextContent(type='text', text=json.dumps(value))],
            structured,
        )

    return server


def _echo_tools() -> list[Tool]:
    return [
        Tool(
            name='app.echo',
            description='Echo the text back to the caller.',
            inputSchema={
                'type': 'object',
                'properties': {'text': {'type': 'string'}},
                'required': ['text'],
                'additionalProperties': False,
            },
        ),
        Tool(
            name='app.noop',
            description='No-op command — returns null.',
            inputSchema={
                'type': 'object',
                'properties': {},
                'additionalProperties': False,
            },
        ),
        Tool(
            name='app.fail',
            description='Always returns an error result.',
            inputSchema={
                'type': 'object',
                'properties': {},
                'additionalProperties': False,
            },
        ),
    ]


def _echo_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == 'app.echo':
        return {'value': {'text': args.get('text', '')}}
    if name == 'app.noop':
        return {'value': None}
    if name == 'app.fail':
        return {
            'error': {'code': 'boom', 'message': 'always fails', 'details': {'why': 'test'}}
        }
    return {'error': {'code': 'unknown_command', 'message': f'no such command: {name}'}}


@asynccontextmanager
async def echo_server() -> AsyncIterator[ActureClient]:
    """Async context manager that yields a connected ``ActureClient``
    talking to an in-memory acture-shaped server. **Use inside an
    ``async with`` block in the test itself**, not as a fixture — that
    avoids the anyio task-boundary trap when pytest-asyncio shuts down
    fixtures."""
    server = make_acture_like_server(tools=_echo_tools(), handler=_echo_handler)
    async with create_connected_server_and_client_session(server) as session:
        listing = await session.list_tools()
        yield ActureClient(session, _tools_to_dict(listing))


# Expose `echo_server` to tests as a plain fixture returning the
# factory (not a yielded value). Tests use it as:
#     async with echo_server() as client: ...
@pytest.fixture
def echo_server_factory() -> Callable[[], Any]:
    return echo_server
