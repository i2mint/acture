# Next Session — `acture` core positioning-alignment review

**Your role:** review (and refactor where the review demands it) the `acture` **core** package so it genuinely lives up to `docs/positioning.md`. This is the immediate next step after the v1.5 repositioning + namespace-migration increment.

**This is a review first, a refactor second.** Do not start rewriting. Audit, find the gaps, then make the *minimum* changes the audit surfaces. The closed `CommandRecord` (15 fields) does not change.

## Step 0 — Orient

Read, in this order:

1. `docs/positioning.md` — **canonical.** The dev-tool-first principle and the two flexibility dimensions. This is the standard you are auditing core against.
2. `docs/roadmap.md` — where this session sits, what's done, what's deferred.
3. `.claude/skills/acture-architecture-primer/SKILL.md` and `.claude/skills/acture-consumer-integration/SKILL.md`.
4. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before changing anything.
5. `.claude/skills/acture-command-record-shape/SKILL.md` — the closed surface you must not widen.
6. `packages/core/` — the actual code under review.

## Step 1 — The audit

The positioning makes two promises about core. Check whether the code keeps them.

**Promise A — core is the minimal primitive.** `acture` core is *registry + dispatcher + schema bridge + the state-adapter interface*, and nothing else. Audit `packages/core/src` for anything that is really consumer logic, adapter logic, or convenience that belongs in an optional package. For each thing in core, ask: is this a *primitive*, or is it an *accelerator that crept inward*? Anything that fails belongs in (or as) a separate optional package.

**Promise B — the agent-written path is real.** The positioning says a developer can stand up command dispatch with *zero* `acture-*` dependency — the agent hand-writes it. Is that actually achievable today? An agent has the skills (which explain acture's *design*) and core's source (as a *reference implementation*). Could it reproduce an equivalent minimal registry + dispatcher in a target project from those? If not — if the patterns are only encoded as installable code and never as a *legible, reproducible reference* — that is the central gap, and closing it is the most valuable thing this session can do.

Also check the boundary the hard-don'ts care about: core imports zero React, zero state libraries (hard-don'ts #6, and the spirit of #2/#3). Verify, don't assume.

## Step 2 — Decide the deliverable with the user

The audit will land in one of a few places. **Surface the finding to the user before refactoring** — the right deliverable is a judgment call:

- If core is already minimal and the agent-written path is genuinely reproducible from existing material → the deliverable may be just a short written confirmation + any small tightening. That is a fine outcome; do not invent work.
- If non-primitive code has crept into core → propose the extraction (to which package?) and confirm scope before moving code.
- If the agent-written path is *asserted but not reproducible* → the likely deliverable is a new reference artifact: a "hand-written registry" reference doc, and/or a consumer/greenfield skill that walks an agent through writing the dispatch layer by hand. Confirm the shape with the user.

Use `AskUserQuestion` for the scope fork. Do not guess.

## Step 3 — Refactor (only what Step 1–2 justified)

- Rule of three and the hard-don'ts still bind. The `CommandRecord` stays at 15 fields.
- If you move code between packages, it is a `minor` for the gaining package and the losing package; changeset accordingly.
- `pnpm build && pnpm test && pnpm typecheck` green across the workspace; example apps still build and pass.

## Step 4 — Wrap up

- Update `docs/roadmap.md`: mark this item done, record what the audit found, move the "macros + e2e tooling" item to NEXT.
- Write a short reflection (`docs/core-review-reflection.md` or fold into the roadmap — your call; keep it short).
- Replace this file with the handoff for the macros + e2e tooling work (see `docs/roadmap.md` §"Next" for what that entails).

## Note — all packages are published

All 15 packages are live on npm as of 2026-05-14. The MCP adapter ships as **`acture-mcp-server`** (the unscoped name `acture-mcp` was already taken by an unrelated project). Nothing to publish before starting this review.

## When unsure

Re-read `docs/positioning.md` and `docs/roadmap.md`. If a change is irreversible or you cannot tell whether it honours the positioning, append to `docs/escalations.md` (create if missing) and ask the user.

**Good luck.** The point of this session is to make the dev-tool-first promise *true in the code*, not just in the docs. A clean "it already holds" is a perfectly good result — the failure mode is inventing a refactor to look busy.
