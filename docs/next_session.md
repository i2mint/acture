# Next Session — macros + e2e testing tooling

**Your role:** build the two least-tooled consumer surfaces — **macros** and
**e2e testing** — per `docs/positioning.md`. This is the increment after the
v1.6 core positioning-alignment review.

These two surfaces are structurally near-identical: both are a sequence (or
DAG) of `{commandId, params}` pairs, replayed through `registry.dispatch`. An
e2e test is a macro with assertions (journal article §3.4, §3.7). That shared
structure is the central design question of this session — see Step 1.

## Step 0 — Orient

Read, in this order:

1. `docs/positioning.md` — **canonical.** Dev-tool-first; the two flexibility
   dimensions. Both new surfaces must keep both dimensions open.
2. `docs/roadmap.md` — the "Next" section is this work; "Status snapshot" and
   the v1.6 "Done" entry are where you're starting from.
3. `.claude/skills/acture-architecture-primer/SKILL.md` and
   `.claude/skills/acture-consumer-integration/SKILL.md` — macros and e2e are
   **consumer surfaces**, so the consumer-integration positioning binds.
4. `.claude/skills/acture-hard-donts/SKILL.md` — re-read before adding a package.
5. `docs/command_dispatch_journal_article.md` §3.4 + §3.7 — the "e2e test is a
   macro with assertions" framing.
6. `docs/hand-written-registry.md` — the v1.6 reproducibility reference; the
   command-sequence concept should get the same agent-written-path treatment.

## Step 1 — Settle the design question FIRST (before building)

**Macros and e2e share so much structure that a single command-sequence
substrate underneath both may be the right shape — rather than two unrelated
packages.** Evaluate this before committing to a package layout. The options:

- One shared `acture-sequence` (or similarly-named) substrate — record /
  compose / replay of `{commandId, params}` sequences — with macros and e2e as
  thin layers on top (e2e adds assertions + a Playwright binding).
- Two independent packages that happen to look similar.
- A pattern + skill for the shared concept (no package), with only the
  tool-bound piece (`acture-e2e-playwright`) shipping as a package.

Use `AskUserQuestion` for this fork. The rule of three and the hard-don'ts
(especially #2, no god-package) both bind the answer. Do not guess.

## Step 2 — Build, per the positioning

Whatever Step 1 decides, these constraints hold:

- **Core enables; packages are separate and optional.** The command-sequence
  *concept* (record / compose / replay) is something an agent can hand-write
  following a documented pattern — give it the `docs/hand-written-registry.md`
  treatment. Specialized, tool-bound implementations are separate optional
  packages.
- **`acture-e2e-playwright`** — reusable e2e code bound specifically to
  **Playwright**. Playwright is the tool choice here; the consumer skill must
  still document the agent-written path and that other runners (Cypress, etc.)
  are valid choices — per `acture-consumer-integration` §Step 2.
- **Macros** — a record/replay tool. Step 1 decides whether it ships as a
  package, a pattern + skill, or both.
- **Each surface gets a consumer-integration skill** — `acture-e2e` and
  `acture-macros` — building on `acture-consumer-integration`.

## Step 3 — Wrap up

- `pnpm build && pnpm test && pnpm typecheck` green across the workspace;
  example apps still build + pass. Add a worked example if the surface needs
  one to be legible.
- Changesets: `minor` for any new or changed package.
- Update `docs/roadmap.md`: mark the macros + e2e item done, record what was
  built and the Step 1 decision, move the next backlog item to "Next".
- Write a short reflection (`docs/v1_7-reflection.md` or similar — keep it short).
- Replace this file with the handoff for whatever the roadmap says is next.

## Note — all packages are published

All 15 packages are live on npm as of 2026-05-14. The MCP adapter ships as
**`acture-mcp-server`**. Nothing to publish before starting this work; the next
release goes out when the pending changesets (including v1.6's
`tier-warnings` extraction) are versioned.

## When unsure

Re-read `docs/positioning.md` and `docs/roadmap.md`. If a change is
irreversible or you cannot tell whether it honours the positioning, append to
`docs/escalations.md` (create if missing) and ask the user.

**Good luck.** The shared-substrate question in Step 1 is the crux — get that
right and the rest follows. Don't ship two packages that should have been one,
and don't ship one god-package that should have been two.
