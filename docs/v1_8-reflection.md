# v1.8 Reflection

**Authored:** 2026-05-14 by the v1.8 implementing agent. Skills + docs only — no package code changed. Full workspace re-verified green: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` (16 packages + 4 examples, 419 package tests + 41 example tests).

v1.8 added the three per-surface consumer skills for the consumer surfaces that already have shipping packages: **hotkeys**, **MCP**, and **AI tool calling**. It is the natural continuation of the consumer-skill family — the foundation (`acture-consumer-integration`) plus palette/macros/e2e were already in place; v1.8 fills three of the six remaining gaps.

## Step 1 — the scope decision

`docs/next_session.md` left Step 1 open: pick an increment from Deferred / backlog. Settled with the user via `AskUserQuestion` (two questions):

1. **Which increment** — chose **per-surface consumer skills** over codemods README/CLI polish and greenfield agent-track skills (the roadmap's recommended default; low risk, steady value, fills out the primary delivery surface).
2. **Which surfaces** — chose **hotkeys + MCP + AI**, the three surfaces with shipping packages (`acture-hotkeys`, `acture-mcp-server`, `acture-ai-vercel`). **telemetry / undo / extensions were deliberately excluded:** they have no shipping packages yet (telemetry & undo are post-v1), so their consumer skills would be agent-written-path-only — heavier, less consistent with the palette/macros/e2e template, and better as a later increment if/when those packages exist.

This kept the increment bounded and consistent: three skills, each backed by a real package, each following the established template.

## What v1.8 shipped

Three skills, all building on `acture-consumer-integration`, all following the `acture-macros` / `acture-e2e` template (the "load the foundation first" callout, the two-decisions framing, the "what to get right" list, the "what NOT to build (wait for a real need)" section, grounded see-also links):

- **`acture-hotkeys`** — keyboard shortcuts as a registry projection. Tool-library choice (tinykeys / react-hotkeys-hook / mousetrap / custom); agent-written vs the `acture-hotkeys` package; the surface specifics that make hotkeys a faithful projection rather than a parallel system — `keybinding` read off the record (never a hand-kept table), dispatch through `registry.dispatch`, fire-time `when`-clause evaluation, first-registered-wins conflict resolution, the input-aware default, modal scoping via the bind target; the inward positioning for the package (plain-DOM core + optional React wrapper, hard-don'ts #3/#6).
- **`acture-mcp`** — the registry as an MCP server. The two-layer split (pure projection, transport-agnostic; SDK glue isolated); the SDK/transport choice (one SDK, the fork is the transport — note the spec is date-versioned, treat upgrades as semver-major); tier filtering as a parameterized projection not adapter logic; the deterministic `@deprecated` banner; function-`when` exclusion; errors-as-data on the wire; and a dedicated security-guardrails section (hard-don'ts #5/#10 — this surface is exposed to untrusted callers).
- **`acture-ai`** — the registry as LLM tool definitions. The SDK choice and the schema-projection fork it drives (SDKs that take a schema object → pass Zod through; SDKs that want JSON Schema → project through `toJsonSchema`); errors-as-data; the deprecation banner mirroring `acture-mcp-server`; function-`when` exclusion; the security guardrails (the LLM proposes, the registry decides); and the cross-reference that an AI-composed tool-call sequence *is* a macro (one format — load `acture-macros`).

MCP and AI are explicitly cross-linked: they share tier filtering, deprecation banners, function-`when` exclusion, and errors-as-data, and differ on schema projection (MCP always JSON Schema; AI SDKs may take Zod directly). Each skill names `packages/<pkg>/src/` as a worked example to *adapt, not import*.

### Consistency updates

- `acture-architecture-primer`'s eight-consumer-surface list now references the per-surface skills (`acture-palette-design`, `acture-hotkeys`, `acture-ai`, `acture-mcp`) alongside the packages — consistent with how v1.7 wired in macros/e2e.
- `acture-consumer-integration`'s "See also" now enumerates all six per-surface skills.
- `docs/roadmap.md` updated: v1.8 Done entry, skills count 17 → 20, Next section, the Deferred backlog entry split (hotkeys/MCP/AI done; telemetry/undo/extensions deferred for lack of packages), tracking table.

## What v1.8 did NOT ship

- **No telemetry / undo / extensions consumer skills.** The Step 1 scope decision — no shipping packages, so they would be agent-written-path-only. Deferred to a later increment.
- **No package code changes, no new package, no changeset.** This was a skills + docs increment by design. The publishing state is unchanged from v1.7 (the two pending changesets — `tier-warnings` extraction and `acture-e2e-playwright` — are still queued for the next `changeset version`).
- **`CommandRecord` unchanged** — still closed at 15 fields. Consumer skills teach how to *project* the registry; they touch no metadata.

## Hard-don'ts audit

Ran `.claude/skills/acture-hard-donts/SKILL.md` against the v1.8 increment.

1. **No conditional logic in command metadata.** ✅ Zero `CommandRecord` changes. The skills teach projection, not metadata.
2. **No god-package.** ✅ No new package. Three skills, each for one surface, each backed by one existing single-accelerator package.
3. **No business logic in adapter packages.** ✅ Each skill explicitly states the package *translates* and names the temptations (per-user tool visibility, auth in the adapter, prompt-engineering beyond the deprecation banner) as things NOT to build — pushing them to `when`-clauses / core / the host.
4. **No `if (mode === ...)` in shared helpers.** ✅ N/A — no code.
5. **No `eval()`-ing LLM-produced strings.** ✅ Both `acture-mcp` and `acture-ai` carry a dedicated security-guardrails section: replay routes through `registry.dispatch` (`Map.get` + schema validation), never reflective invocation.
6. **No coupling the registry to React.** ✅ `acture-hotkeys` explicitly documents the plain-DOM core + optional React wrapper split and that the main entry has zero React.
7. **No promoting `@experimental` to `@stable` without a migration story.** ✅ N/A.
8. **No bundling a UI kit.** ✅ N/A.
9. **No marketing on category.** ✅ Each skill leads with the concrete framing ("keyboard shortcuts are a projection of the registry", "MCP tools *are* commands", "LLM function calling needs exactly the metadata a command registry already carries").
10. **No assuming the LLM's chosen function is authorization.** ✅ Both `acture-mcp` and `acture-ai` state it directly: "the LLM proposes; the registry decides"; schema validation at the dispatcher regardless of caller; no per-surface trust fast-path.

**Positioning check (merge-ritual #6).** Could a developer get hotkeys / MCP / AI tool calling with zero `acture-*` dependency? **Yes** — every skill documents the agent-written path as a first-class option (iterate the registry, dispatch through `registry.dispatch`, ~30–50 lines owned), names the realistic tool-library choices as the user's, and frames the `acture-*` package as the opt-in accelerator. The dev-tool-first principle holds.

## Stat sheet

| Metric | v1.7 end | v1.8 end | Δ |
| --- | --- | --- | --- |
| Packages | 16 | 16 | 0 |
| Worked examples | 4 | 4 | 0 |
| Tests (packages) | 419 | 419 | 0 |
| Tests (examples) | 41 | 41 | 0 |
| Skills | 17 | 20 | +3 (`acture-hotkeys`, `acture-mcp`, `acture-ai`) |
| Reproducibility reference docs | 2 | 2 | 0 |
| CommandRecord fields | 15 | 15 | 0 — closed surface still holds |

CI green across the workspace: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all pass.

## Release readiness

- ✅ Skills + docs only; no package code touched; full workspace build / typecheck / test re-verified green.
- ✅ Hard-don'ts audit clean; positioning check passes.
- ✅ No changeset needed (skills + docs alone). Publishing state unchanged from v1.7 — the two pending changesets remain queued.

**v1.8 is DONE.** Next session: see `docs/next_session.md` — pick the next increment from the roadmap's Deferred / backlog (codemods README/CLI polish and greenfield agent-track skills are the strongest remaining picks).
