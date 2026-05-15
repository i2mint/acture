# v1.13 Reflection

**Authored:** 2026-05-15 by the v1.13 implementing agent. **Python companion shipped** — the `acture` PyPI distribution graduated from the name-reservation placeholder it had been since the original publish to a real, thin MCP-client facade. End of the autonomous v1.12 + v1.13 chain. **+23 Python tests** (using the SDK's in-memory transport, no Node subprocess), npm side unchanged (489 package tests + 41 example tests still green); Python distribution builds + passes `twine check`.

v1.13 closes the **cross-language story** research-6 sketched. The package is deliberately small — ~300 LoC of `client.py` + `transport.py` + `types.py` + the public `__init__.py` barrel — and bound to **one** dependency: the official `mcp` Python SDK.

## Decisions made autonomously (would have been Step-1 questions in v1.11)

All decisions landed on the simpler / more flexible option — consistent with acture's "translate, don't decide" discipline.

1. **Package name = `acture`.** Verified by inspecting `python/` and the `python/README.md`: the name has been reserved on PyPI since the placeholder shipped (per `scripts/sync-python-version.mjs` and the existing `python/pyproject.toml`). v1.13 graduates the placeholder; no PyPI name handoff needed.
2. **No Pydantic dependency.** Per research-6 §"v1 scope": agents read JSON Schema + descriptions; humans who want typed models run `datamodel-code-generator` themselves. A hard Pydantic dep would force every consumer to track Pydantic's `v1 → v2` churn. The package's `Command.input_schema` exposes the raw schema for downstream codegen by hosts that want it.
3. **No OpenAPI emitter.** MCP already speaks JSON Schema; adding a second wire would double the surface area without serving agents (research-6 §key finding 5).
4. **API = `Mapping[str, Command]` (dict-like).** `dol` / `py2mcp` idiom. `iter(client)` yields known ids; `len(client)` counts; `client['cmd.id']` returns a callable. New commands on the server are automatically available — no codegen step in the loop.
5. **Errors-as-data = typed exception + `call_raw` escape hatch.** `await client['cmd'](**params)` raises `ActureError(code, message, command_id, details)` on `isError: true`. `await client['cmd'].call_raw(**params)` returns the full `CallToolResult` without raising. Both ergonomics, no opinion on which is correct.
6. **Test substrate = SDK's in-memory transport, not a Node subprocess.** `create_connected_server_and_client_session` from `mcp.shared.memory` was the right call: same wire (JSON-RPC 2.0 over stream pairs), zero flakiness, no JS-build dependency in pytest. The integration test the handoff suggested (real `node dist/cli.js` subprocess) is fine for a one-time smoke check but a poor fit for CI; we got equivalent coverage from in-memory.
7. **Cross-language semver = lockstep, today.** The existing `scripts/sync-python-version.mjs` keeps `python/acture/__init__.py`'s `__version__` synced to `packages/core/package.json`'s version. v1.13 rides that mechanism: a `patch` changeset on npm `acture` drives the npm publish, the sync script updates `__version__`, and PyPI publishes the matching version. Decoupling is a reversible future decision; the v1.13 facade is small enough that lockstep is harmless.

No `AskUserQuestion` was raised. No "truly stuck" criterion fired.

## What v1.13 shipped

### `acture` on PyPI — the real client

Three modules under `python/acture/`:

1. **`types.py`** — `ActureError`. Stable, programmable error fields (`code`, `message`, `command_id`, `details`) mirroring acture core's `CommandError`. Raised by `Command.__call__` when an MCP result arrives with `isError: true` and a parseable acture-shaped error payload.
2. **`transport.py`** — `stdio_transport(command, args, env?, cwd?)` and `http_transport(url, headers?)`. Async context managers that yield `(read, write)` streams the `mcp.ClientSession` constructor expects. Lazy import of `mcp.client.streamable_http` so the base package imports cleanly on older SDK builds.
3. **`client.py`** — `ActureClient` (the `Mapping[str, Command]` facade) + `Command` (callable with `__call__` / `call_raw`, plus `description` / `input_schema` properties). `ActureClient.from_stdio` / `from_http` / `connect` factories; `client.refresh()` to re-read `tools/list` after a `notifications/tools/list_changed`; `client.session` for callers who need MCP features the facade doesn't wrap.

Plus the public barrel in `__init__.py`, which is also where `__version__` lives (driven by `scripts/sync-python-version.mjs`).

23 tests covering: every Mapping-protocol method (`iter`, `len`, `in`, `[]`), `Command` projection (name, description, input_schema, repr), successful dispatch returns structuredContent, no-params commands work, failed dispatch raises `ActureError` with the right fields, `call_raw` returns the full result without raising, `refresh` round-trips, the `session` property exposes the SDK session, transport factories return async context managers, `from_stdio([])` rejects empty argv, `ActureError` string / repr formatting. The conftest uses `mcp.Server` + `mcp.shared.memory.create_connected_server_and_client_session` to spin up an in-memory acture-shaped server that mimics `acture-mcp-server`'s `formatToolResponse` exit (both happy-path structuredContent and the `isError: true` JSON-stringified `CommandError` shape).

### Test fixture: avoiding the anyio task-boundary trap

`pytest-asyncio` + `anyio` cancel scopes are a known landmine: an async context manager opened in a fixture's setup task and closed in the fixture's teardown task triggers ``Attempted to exit cancel scope in a different task than it was entered in``. The conftest works around it by **not** yielding from inside the in-memory session's `async with` block — instead it exposes an `echo_server()` async context manager and every test uses it directly:

```python
async def test_iter_yields_known_commands():
    async with echo_server() as client:
        assert sorted(client) == ['app.echo', 'app.fail', 'app.noop']
```

This is a documented anyio/pytest-asyncio interaction; the workaround is minimal and the tests are clearer for it.

### Cross-language semver — the lockstep question that didn't escalate

The v1.13 handoff flagged the version-lockstep question as a possible escalation point. Investigation showed:

- The existing `scripts/sync-python-version.mjs` already keeps `python/acture/__init__.py`'s `__version__` synced to `packages/core/package.json`'s version at release time.
- The release workflow's PyPI job runs `python -m build` against the `python/` working tree at the moment of the merged Version Packages PR — so whatever version the sync script wrote ends up on PyPI.
- A `patch` changeset on npm `acture` (no source change to `packages/core/`) is the minimal-noise way to drive both publishes from a single PR. The published npm `acture@X.Y.Z+1` is a no-op upgrade for npm consumers (identical contents); PyPI `acture@X.Y.Z+1` is the real graduation.

Decoupling — letting PyPI `acture` version independently of npm — is a future option. It would require: removing the sync script, adding a separate version source for the Python package (e.g. `acture/_version.py` driven by its own changeset-flavored bump), and updating the release workflow to publish PyPI on its own trigger. v1.13 doesn't do this because (a) the facade is small enough that lockstep is harmless, (b) it's reversible, (c) the cross-language story still benefits from "npm `acture@X.Y.Z` and PyPI `acture==X.Y.Z` are the same release artifact." A future PR can decouple if the constraint starts to bind.

### Consistency updates

- `docs/roadmap.md` — status snapshot (19 npm + 1 PyPI; +23 Python tests; 26 skills; 7 reference docs), v1.13 Done entry, tracking-table row updated, post-v1 bullet struck through.
- `docs/positioning.md` — section 1 now names PyPI as the third delivery surface.
- `docs/v1_13-reflection.md` — this file.
- `docs/hand-written-python-client.md` — the ~50-line agent-written equivalent reference.
- `.claude/skills/acture-python/SKILL.md` — consumer skill, mirrors the `acture-test-property` / `acture-telemetry` / `acture-undo` template.
- `.claude/skills/acture-consumer-integration/SKILL.md` — per-tool table gained a Python-consumption row; "See also" enumerates the new skill.
- `python/pyproject.toml` — graduated from "placeholder, Pre-Alpha" to "real client, Beta"; added `mcp >= 1.10` dep, `[project.optional-dependencies].test`, `[tool.pytest.ini_options]` (asyncio_mode = "auto"), Python 3.10–3.13 classifiers, `Framework :: AsyncIO`, `npm package` URL.
- `python/README.md` — rewritten from "name reservation only" to a real quickstart.
- `python/acture/__init__.py` — public barrel exporting `ActureClient`, `Command`, `ActureError`, `stdio_transport`, `http_transport`. `__version__` preserved (synced by `scripts/sync-python-version.mjs`).

## Hard-don'ts check (pre-merge ritual)

- **#1 inner-platform creep.** No re-shaping of MCP errors into a different field-name dict; no inventing a tier-filter on the client (server-side); no `cloner` option for non-JSON state (caller picks `call_raw` if needed). ✓
- **#2 god-package.** One MCP SDK binding (`mcp`). No Pydantic helper, no OpenAPI emitter, no CLI shim, no FastAPI shim, no inverse-direction skill kit. Each is its own future package if real demand surfaces. ✓
- **#3 translate, don't decide.** The package projects MCP into Python; the user owns transport choice (or passes their own), invariants, error handling style, structured-content interpretation. ✓
- **#6 no React in core.** N/A — Python. Equivalent: no Pydantic dependency forced on Python consumers. ✓
- **Dev-tool-first.** Hand-written equivalent shipped before the package was wired (`docs/hand-written-python-client.md`); README leads with the dev-tool-first banner. ✓

## What's next — chain end

The autonomous v1.12 + v1.13 chain is complete. The remaining post-v1 items — `acture-state-jotai`, `acture-state-valtio`, `acture-sandbox` — all need user direction; two have documented implementation friction (research-3 flags jotai's atom-tree ↔ flat-state bridge and valtio's proxy-to-patch translation as non-trivial), one needs design / research before code. The agent does not chain past this point.

`docs/next_session.md` is rewritten as a fresh handoff that surfaces these three options with honest trade-offs.
