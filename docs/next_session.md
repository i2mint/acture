# Next Session — autonomous chain: v1.12 + v1.13

**Your role:** ship the next two increments autonomously. Don't ask the
user for shape decisions, scope, or direction unless you are **truly
stuck** (see criteria below). The user explicitly asked for this: "make
the best choices … just go on coding, testing, validating, and moving to
the next item."

The scope is **pre-committed**:

- **v1.12 — `acture-test-property`** (TS, builds on `acture-e2e-playwright`'s sequence engine)
- **v1.13 — Python companion** (PyPI, thin MCP-client facade per research-6)

After both ship, **STOP and report**. The remaining post-v1 items
(jotai/valtio adapters, `acture-sandbox`) have documented implementation
friction or need design work — surface those to the user as a fresh
decision rather than chaining further.

## Operating mode

For each increment:

1. Read the per-increment plan below; load the named skills.
2. Build, test, typecheck — green across the workspace.
3. Add the `minor` changeset(s).
4. Update `docs/roadmap.md` (Status snapshot + Done entry + tracking
   table); write a short reflection (`docs/v1_12-reflection.md`,
   `docs/v1_13-reflection.md`).
5. Commit (single substantive commit per increment), push to `main`.
6. Wait for the Release workflow to open the Version Packages PR
   (`gh run watch <id>` then `gh pr list --state open`).
7. Merge the Version Packages PR (`gh pr merge <n> --merge`), wait for
   the publish run to complete, verify with `npm view <pkg> version`
   (or `pip index versions <pkg>` for Python).
8. Pull the version-bump commit (`git pull --ff-only origin main`).
9. Move to the next increment.

After v1.13 publishes: rewrite this file to a fresh handoff that
surfaces the remaining post-v1 options for the user.

## When to stop and ask — "truly stuck" criteria

Escalate to the user via `AskUserQuestion` ONLY when one of these holds:

- A test you can't get green after **three** focused fix attempts.
- A hard-don't violation you can't avoid without changing the increment's
  architecture (e.g., would have to put React in core to ship the feature).
- An architectural decision where the two valid options have **genuinely
  different downstream consequences** for users (not "two equally fine
  callbacks"). Surface concrete trade-offs.
- An external blocker outside your control: PyPI / npm auth fails, a CI
  workflow that's misconfigured at the repo level, a missing repo secret.
- Discovering that the pre-committed scope is **wrong** — e.g., the
  research-6 Python spec turns out to be obsoleted by a change to
  `acture-mcp-server` that the spec didn't anticipate.

Otherwise: make the call, document it briefly in the reflection, keep
moving. The bar is *truly stuck*, not "uncertain." Last-session shape
decisions all landed on the simpler / more flexible option; that pattern
holds.

## Standing constraints (re-state for v1.12 + v1.13)

- **`docs/positioning.md` is canonical.** Dev-tool-first; the two
  flexibility dimensions; each new package documents its hand-written
  equivalent in `docs/hand-written-*.md`.
- **`docs/redesign_takeaways.md` §6.** The rule of three is for acture
  *users*. For maintainer decisions, the principles are YAGNI / wait for
  a concrete named need, hard-don't #2 (no god-package), and the
  dev-tool-first principle. No callers-counting gate.
- **Hard-don'ts bind** (`acture-hard-donts` skill). #2 (no god-package),
  #3 (translate, don't decide), #6 (no React in core) are the
  load-bearing ones for both increments.

---

## v1.12 — `acture-test-property` (TS)

A new package that gives users fast-check arbitraries over their command
registry: random `CommandSequence`s replayed via
`acture-e2e-playwright`'s `replaySequence`, with invariant assertions.
Builds *on* the v1.7 sequence layer; does NOT re-derive it.

### Step 0 — Load

Read (in addition to Step 0 above):

1. `packages/e2e-playwright/src/sequence.ts` — the sequence engine.
   `acture-test-property` will import `recordSequence` / `replaySequence`
   / `CommandSequence` from `acture-e2e-playwright`.
2. `packages/codemods/src/types.ts` — the closed `CommandRecord` shape
   you'll need to inspect to derive arbitraries.
3. `docs/research/acture_research_4 …` if helpful — fast-check
   appears in the v1 plan as the property-test substrate.
4. `.claude/skills/acture-consumer-integration/SKILL.md` (standing rule —
   test-property is a consumer surface).

### Step 1 — Pre-decided shape

These calls are settled. Implement directly; don't ask.

- **Tool-library choice:** `fast-check`. Realistic alternatives (jsverify,
  hand-rolled property runners) are not industry-standard; `fast-check`
  is the dominant JS property-testing library. Document this as the
  user's choice in the README (the README "Decision 1" lines from
  `acture-consumer-integration`), but ship one binding only.
- **Zod → fast-check arbitrary mapping:** use the `@fast-check/zod`
  package if installable; otherwise ship a small in-package mapper
  covering the JSON-Schema-representable subset (`z.string`, `z.number`,
  `z.boolean`, `z.enum`, `z.literal`, `z.array`, `z.object`, `z.union`,
  `z.optional`, `z.nullable`). Document the subset in the README; bail
  out on unsupported schema types with a clear "not arbitrary-able"
  error rather than a silent skip. (Check whether `@fast-check/zod`
  exists on npm before deciding; the in-package mapper is the
  YAGNI-respecting fallback.)
- **API shape:**
  ```ts
  import { propertyTest, commandArbitrary, sequenceArbitrary } from 'acture-test-property';

  // Generate one random { commandId, params } pair:
  const cmdArb = commandArbitrary(registry, { tiers: ['stable'] });

  // Generate a random CommandSequence:
  const seqArb = sequenceArbitrary(registry, { length: { min: 1, max: 10 } });

  // Run a property — for each random sequence, replay it and check invariants:
  await propertyTest({
    registry,
    adapter,
    invariants: [
      { name: 'count never negative', check: (state) => state.count >= 0 },
    ],
    runs: 100,
    sequenceLength: { min: 1, max: 20 },
  });
  // Returns the fast-check run result; throws on counter-example.
  ```
- **Result shape on counter-example:** include the failing sequence in
  the thrown error (`Error & { sequence: CommandSequence }`) so the user
  can replay it deterministically.
- **No god-package.** Ship one accelerator: fast-check-based property
  testing. Do NOT bundle a CI integration, an HTML report, or a Jest
  matcher — each is its own future package if real demand surfaces.

### Step 2 — Build

Package skeleton:

```
packages/test-property/
  package.json          ← peer: acture, fast-check; dev: acture-e2e-playwright, vitest
  tsconfig.json         ← extend ../../tsconfig.base.json
  tsup.config.ts        ← single entry
  vitest.config.ts      ← node env
  src/
    index.ts            ← exports
    arbitraries.ts      ← commandArbitrary, sequenceArbitrary, zodToArbitrary
    property.ts         ← propertyTest
    arbitraries.test.ts
    property.test.ts
  README.md             ← lead with concrete win; document the agent-written path
```

Test plan (~15–20 tests):
- `commandArbitrary` only returns ids the registry knows.
- `commandArbitrary` respects the `tiers` filter.
- `commandArbitrary`'s params validate against the command's schema.
- `sequenceArbitrary` respects `length.min` / `length.max`.
- `zodToArbitrary` handles each supported Zod type.
- `zodToArbitrary` throws clearly on unsupported types.
- `propertyTest` runs `runs` sequences.
- `propertyTest` calls each invariant after each step (or at the end —
  pick one and document it; end-of-sequence is simpler and matches
  e2e's `replayTest`).
- `propertyTest` throws on a failing invariant with the sequence
  attached to the error.
- `propertyTest` works with both `acture-state-zustand` and
  `acture-state-redux` (test against both).

### Step 3 — Hand-written equivalent

`docs/hand-written-test-property.md` — the ~60-line agent-written
equivalent (loop N times: generate sequence from registry.list(),
replay via the hand-written sequence engine from
`docs/hand-written-command-sequence.md`, run invariants). Faithfulness
note matches the existing reference docs.

### Step 4 — Consumer skill

`.claude/skills/acture-test-property/SKILL.md`. Mirror the
`acture-telemetry` / `acture-undo` template:
- Load `acture-consumer-integration` first.
- Two decisions to surface (Decision 1: fast-check vs. hand-rolled —
  fast-check is the user's likely choice; Decision 2: agent-written vs.
  the package).
- The contract: invariants run end-of-sequence (default), arbitraries
  respect the registry, counter-examples are reproducible via the
  attached sequence.
- What NOT to build (CI integration, HTML report, jest matcher).

### Step 5 — Wrap up

`pnpm -r build && pnpm -r typecheck && pnpm -r test` green.
`acture-test-property` `minor` changeset at debut. Update primer
consumer-surface list if appropriate (test-property is the e2e surface's
property-test variant; it doesn't add a 9th surface). Commit,
push, version, publish.

---

## v1.13 — Python companion (PyPI)

Cross-language story. Thin MCP-client facade against `acture-mcp-server`.

### Step 0 — Load

Read (in addition to Step 0 above):

1. **`docs/research/acture_research_6 …`** — research-6 is the spec.
   Read it carefully; it gives the package a ~300 LoC shape, a
   `dol`/`py2mcp` dict-like idiom, and explicitly bounds what's NOT in
   v1 (no Pydantic codegen SDK, no OpenAPI emitter — those are
   post-companion for human consumers).
2. `packages/mcp/src/` — the server side. The Python client connects to
   any `acture-mcp-server` instance.
3. The repo's Python publishing setup — check `.github/workflows/` for
   the "Publish Python stub to PyPI" job and find the existing Python
   stub it publishes (likely a placeholder under a top-level `python/`
   or `py/` directory). Inspect how it's structured before adding the
   real package alongside.

### Step 1 — Pre-decided shape (per research-6)

- **Package name on PyPI:** try `acture` first. If taken, use
  `acture-client`. Verify with `pip index versions acture` before
  committing to the name.
- **Idiom:** dict-like in `dol` / `py2mcp` style. `client = ActureClient(...)`
  → `client['app.foo']` returns a callable / `client['app.foo'](**params)`
  dispatches via MCP `tools/call`. `iter(client)` yields known command
  ids. `len(client)` is the number of commands available.
- **No hard Pydantic dependency.** Optional Pydantic helper if
  `pydantic` is importable; degrade to plain `dict` params otherwise.
- **Out of scope (research-6 §explicit):** Pydantic-codegen SDK,
  OpenAPI emitter. Those are for human consumers, not agents; ship them
  only if real demand surfaces.
- **Test substrate:** spin up an `acture-mcp-server` via a subprocess
  (the Node `dist/cli.js` for a sample registry) and connect a Python
  client to it through stdio. Mark these as integration tests; pure
  unit tests can use a mock transport.

### Step 2 — Build

Use the existing Python stub directory if there is one; otherwise
create the standard layout:

```
python/                    (or wherever the stub lives)
  pyproject.toml           ← name, version 0.1.0, deps, build
  src/acture/
    __init__.py
    client.py              ← ActureClient
    transport.py           ← stdio / http transports
    types.py               ← Result / Effect mirroring
  tests/
    test_client.py
    test_transport.py
  README.md
```

If the user has `dol` / `py2mcp` available locally (they have ~200
Python projects per CLAUDE.md), follow their idioms — but DO NOT add a
hard dependency on them; the package is `dol`/`py2mcp`-shaped, not
`dol`/`py2mcp`-dependent.

### Step 3 — Test (~15+ tests)

- Client connects to a mock transport that returns canned `tools/list`.
- `client['cmd.id']` returns a callable.
- `client['cmd.id'](**params)` calls `tools/call` with the right shape.
- Errors-as-data: a `{ ok: false }` result surfaces as a typed
  `ActureError` exception (or a `Result` dict — pick one; per research-6
  the dict-like idiom suggests returning the parsed JSON, not raising;
  document the choice).
- `iter(client)` yields known ids.
- `len(client)` returns the count.
- Tier filter: `ActureClient(server, tiers=['stable'])` only lists
  stable.
- Integration test: real `acture-mcp-server` subprocess, real stdio,
  real dispatch round-trip.

### Step 4 — Reference doc

`docs/hand-written-python-client.md` — the agent-written equivalent. ~50
lines: open the MCP transport, list tools, build a dict subclass, call
tools/call by key. Faithful to the package's exported shapes.

### Step 5 — Skill

`.claude/skills/acture-python/SKILL.md` — how an agent helps a user
**consume** an acture-mcp-server from Python. Mirrors the
consumer-integration template: load
`acture-consumer-integration` first; the agent-written path is always
viable; etc.

### Step 6 — Publish

The existing Python stub workflow handles PyPI publishing. Follow
whatever pattern it uses (likely: tag-driven, or version-in-pyproject
driven, or a separate changeset story). The README's release note for
this increment names the published version explicitly.

### Step 7 — Wrap up

Same as v1.12, plus the cross-language consistency updates:
- `docs/positioning.md` may need a line about the Python surface.
- `docs/roadmap.md` Python companion entry moves from Post-v1 to v1.13
  Done.

---

## After v1.13 — STOP and report

Rewrite this file as a fresh handoff that:

1. Names the v1.12 + v1.13 outcomes (versions, test counts, skill
   counts).
2. Surfaces the remaining post-v1 options for the user, with honest
   trade-offs:
   - `acture-state-jotai` — atom-tree ↔ flat-state bridge is real work
     per research-3; may not implement `PatchCapableAdapter` cleanly.
   - `acture-state-valtio` — proxy-to-patch translation is non-trivial.
   - `acture-sandbox` — needs design / research before code.
3. Explicitly **asks the user** which (if any) to schedule next. Do not
   pick autonomously past this point.

Then commit + push that handoff and stop. The user takes it from there.

## Publishing state at session start

18 packages in the workspace; 15 published on npm (the v1.11 publishes
brought it to 17 npm-live, with `acture-e2e-playwright` still queued
from v1.7). No pending changesets at session start. Each of v1.12 and
v1.13 will add its own changeset + publish flow.

The Release workflow has worked cleanly for v1.9 / v1.10 / v1.11
publishes; reuse the pattern. The "Publish Python stub to PyPI" job
exists and ran successfully on v1.11 — the Python publish should
follow that path.

## When unsure

Re-read `docs/positioning.md`, `docs/redesign_takeaways.md` §6, and
`docs/roadmap.md`. If a change is irreversible, append to
`docs/escalations.md` and ask the user — but for routine shape decisions,
**make the call and document it in the reflection**. The user's standing
instruction is to keep moving, not to ask.

**Good luck.** Two increments to ship. Three meta-rules: hard-don'ts
intact; agent-written path documented; YAGNI applied per increment.
Then stop and let the user steer.
