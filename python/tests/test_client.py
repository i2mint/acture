"""Unit tests for ``ActureClient`` — the dict-like facade.

Tests use the ``echo_server`` async context manager directly inside
each test (rather than a fixture-yielded value) to avoid the
anyio/pytest-asyncio task-boundary "cancel scope" trap.

Coverage:
- Mapping protocol: ``iter``, ``len``, ``in``, ``[]``.
- ``Command`` projection: name, description, input_schema.
- Successful dispatch returns ``structuredContent``.
- Failed dispatch raises ``ActureError`` with the right code/message.
- ``call_raw`` returns the full ``CallToolResult`` without raising.
- ``refresh`` rebuilds the cached tool list from a live ``tools/list``.
- ``KeyError`` for unknown command ids (lookup, not dispatch).
"""

from __future__ import annotations

import pytest

from acture import ActureClient, ActureError, Command

from .conftest import echo_server


@pytest.mark.asyncio
async def test_iter_yields_known_commands() -> None:
    async with echo_server() as client:
        assert sorted(client) == ['app.echo', 'app.fail', 'app.noop']


@pytest.mark.asyncio
async def test_len_returns_command_count() -> None:
    async with echo_server() as client:
        assert len(client) == 3


@pytest.mark.asyncio
async def test_contains() -> None:
    async with echo_server() as client:
        assert 'app.echo' in client
        assert 'no.such.command' not in client


@pytest.mark.asyncio
async def test_getitem_returns_command() -> None:
    async with echo_server() as client:
        cmd = client['app.echo']
        assert isinstance(cmd, Command)
        assert cmd.name == 'app.echo'


@pytest.mark.asyncio
async def test_getitem_unknown_raises_keyerror() -> None:
    async with echo_server() as client:
        with pytest.raises(KeyError):
            _ = client['no.such.command']


@pytest.mark.asyncio
async def test_description_passes_through() -> None:
    async with echo_server() as client:
        assert client['app.echo'].description == 'Echo the text back to the caller.'


@pytest.mark.asyncio
async def test_input_schema_passes_through() -> None:
    async with echo_server() as client:
        schema = client['app.echo'].input_schema
        assert schema.get('type') == 'object'
        assert 'text' in schema.get('properties', {})


@pytest.mark.asyncio
async def test_command_repr_includes_description() -> None:
    async with echo_server() as client:
        r = repr(client['app.echo'])
        assert 'app.echo' in r
        assert 'Echo the text' in r


@pytest.mark.asyncio
async def test_success_returns_structured_content() -> None:
    async with echo_server() as client:
        result = await client['app.echo'](text='hello')
        assert result == {'text': 'hello'}


@pytest.mark.asyncio
async def test_no_params_command_works() -> None:
    # `app.noop` returns null on the server; the conftest wraps non-dict
    # values in `{'value': ...}` because MCP's structuredContent must be
    # a JSON object.
    async with echo_server() as client:
        result = await client['app.noop']()
        assert result == {'value': None}


@pytest.mark.asyncio
async def test_failure_raises_acture_error() -> None:
    async with echo_server() as client:
        with pytest.raises(ActureError) as excinfo:
            await client['app.fail']()
    err = excinfo.value
    assert err.code == 'boom'
    assert err.message == 'always fails'
    assert err.command_id == 'app.fail'
    assert err.details == {'why': 'test'}


@pytest.mark.asyncio
async def test_call_raw_returns_full_result() -> None:
    async with echo_server() as client:
        result = await client['app.echo'].call_raw(text='hi')
    assert result.isError is False
    assert result.structuredContent == {'text': 'hi'}


@pytest.mark.asyncio
async def test_call_raw_does_not_raise_on_error() -> None:
    async with echo_server() as client:
        result = await client['app.fail'].call_raw()
    assert result.isError is True
    assert len(result.content) >= 1


@pytest.mark.asyncio
async def test_refresh_round_trips() -> None:
    # The fixture server's tool list never changes, so refresh is a
    # data-no-op — but the call should round-trip cleanly.
    async with echo_server() as client:
        await client.refresh()
        assert sorted(client) == ['app.echo', 'app.fail', 'app.noop']


@pytest.mark.asyncio
async def test_session_property_exposes_underlying_session() -> None:
    from mcp import ClientSession

    async with echo_server() as client:
        assert isinstance(client.session, ClientSession)


@pytest.mark.asyncio
async def test_client_repr_lists_commands() -> None:
    async with echo_server() as client:
        r = repr(client)
        assert '3 commands' in r
        assert "'app.echo'" in r


# ── Pure-Python tests for the error type ───────────────────────────


def test_acture_error_str_includes_code_and_message() -> None:
    err = ActureError('schema_violation', 'param `x` is required')
    assert 'schema_violation' in str(err)
    assert 'param `x`' in str(err)


def test_acture_error_str_handles_empty_message() -> None:
    err = ActureError('boom', '')
    assert str(err) == 'boom'


def test_acture_error_repr_includes_command_id_and_details() -> None:
    err = ActureError(
        'boom',
        'failed',
        command_id='app.fail',
        details={'why': 'test'},
    )
    r = repr(err)
    assert 'app.fail' in r
    assert "'why': 'test'" in r
