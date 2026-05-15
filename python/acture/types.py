"""Type-level shapes the acture Python client returns and raises.

These mirror — in shape, not implementation — the TypeScript core's
`Result<R>` / `CommandError` types. The Python client speaks JSON over
MCP, so `params` and `value` are `dict | list | str | int | float | bool
| None` (anything `json.loads` produces).

Keeping these tiny and explicit, instead of pulling in Pydantic, is per
research-6 §"v1 scope": Pydantic is an *optional* helper, not a hard
dependency. A Python consumer that wants typed models can layer
``datamodel-code-generator`` over the MCP ``tools/list`` schemas
themselves — that is post-v1 work.
"""

from __future__ import annotations

from typing import Any


class ActureError(Exception):
    """Raised when a command dispatch returns ``isError: true`` from
    the MCP server, or when the client cannot reach the server.

    The shape mirrors acture core's ``CommandError``:

    - :attr:`code` — stable, programmable error code (``'unknown_command'``,
      ``'schema_violation'``, the user's own error codes, …).
    - :attr:`message` — human-readable summary.
    - :attr:`command_id` — the command id that failed, when known. ``None``
      for transport-level errors (timeout, connection refused).
    - :attr:`details` — optional structured payload from the server.

    Errors-as-data is preserved at the MCP boundary: a dispatch that
    returns ``{ ok: false }`` on the TypeScript side arrives at the
    Python client as this exception. Callers who prefer the dict form
    can call :meth:`Command.call_raw` instead of :meth:`Command.__call__`.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        command_id: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(f'{code}: {message}' if message else code)
        self.code = code
        self.message = message
        self.command_id = command_id
        self.details = details

    def __repr__(self) -> str:
        parts = [f'code={self.code!r}', f'message={self.message!r}']
        if self.command_id is not None:
            parts.append(f'command_id={self.command_id!r}')
        if self.details is not None:
            parts.append(f'details={self.details!r}')
        return f'ActureError({", ".join(parts)})'
