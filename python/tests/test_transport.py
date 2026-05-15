"""Tests for ``acture.transport`` helpers.

These tests don't spin up a real subprocess (that would require a
Node-side acture-mcp-server binary in CI). They verify the helper
shapes: that the factories return async context managers, validate
their arguments, and fail loudly when given bad input.

The end-to-end MCP path is exercised by ``test_client.py`` using the
SDK's in-memory transport.
"""

from __future__ import annotations

import inspect

import pytest

from acture.transport import http_transport, stdio_transport
from acture import ActureClient


def test_stdio_transport_returns_async_context_manager() -> None:
    ctx = stdio_transport('python', ['-c', 'pass'])
    # Either an `_AsyncGeneratorContextManager` or any object with
    # `__aenter__` / `__aexit__` — both are acceptable.
    assert hasattr(ctx, '__aenter__')
    assert hasattr(ctx, '__aexit__')


def test_http_transport_returns_async_context_manager() -> None:
    ctx = http_transport('http://localhost:9999/mcp')
    assert hasattr(ctx, '__aenter__')
    assert hasattr(ctx, '__aexit__')


def test_from_stdio_rejects_empty_argv() -> None:
    # Lazy validation — the error fires at connect time. `from_stdio`
    # returns an async context manager; entering it is what raises.
    # Match either eager (at construction) or lazy (at enter):
    try:
        _ctx = ActureClient.from_stdio([])
    except ValueError as e:
        assert 'argv must be non-empty' in str(e)
        return
    # If construction didn't raise, entering the context must:
    import asyncio

    async def _enter():
        async with _ctx:
            pass

    with pytest.raises(ValueError, match='argv must be non-empty'):
        asyncio.run(_enter())


def test_connect_accepts_factory_or_context_manager() -> None:
    """The `transport` argument can be either an async-CM directly or a
    zero-arg factory returning one. Verify the type-level shape; the
    runtime path is exercised by the in-memory client tests."""
    sig = inspect.signature(ActureClient.connect)
    assert 'transport' in sig.parameters
