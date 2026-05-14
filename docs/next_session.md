# Next Session — pick the next increment

**Your role:** choose and ship the next small increment. Unlike the last few
handoffs, this one does **not** prescribe the work — v1.7 closed the last
pre-scheduled item (macros + e2e). The roadmap's "Next" section is now open;
your first job is to pick, with the user, what the increment is.

## Step 0 — Orient

Read, in this order:

1. `docs/positioning.md` — **canonical.** Dev-tool-first; the two flexibility
   dimensions. Everything you ship must keep both open.
2. `docs/roadmap.md` — "Status snapshot", the v1.7 "Done" entry (where you're
   starting from), "Next", and "Deferred / backlog".
3. `docs/v1_7-reflection.md` — what just shipped and why.
4. `.claude/skills/acture-architecture-primer/SKILL.md` and
   `.claude/skills/acture-hard-donts/SKILL.md` — load before any non-trivial
   change.
5. If the increment touches a consumer surface or a consumer-specific package:
   `.claude/skills/acture-consumer-integration/SKILL.md` (standing rule).

## Step 1 — Pick the increment (settle with the user)

The roadmap's **Deferred / backlog** is the candidate pool. No item is
pre-selected. The strongest candidates, with the trade-offs:

- **Per-surface consumer skills** *(recommended default)* — the consumer-skill
  family now has a foundation (`acture-consumer-integration`) and four surface
  skills (`acture-palette-design`, `acture-macros`, `acture-e2e`). Still missing:
  **hotkeys, MCP, AI, telemetry, undo, extensions**. Each is a small,
  self-contained skill building on the foundation; the packages already exist.
  Low risk, steady value, and it fills out the primary delivery surface.
- **Codemods README/CLI polish** — the v1.4 fresh-agent test found the codemods
  README's `npx acture-codemods` story broken and several CLI options
  undocumented. Parked in `docs/backlog/codemods-polish-and-tier-mirror.md`.
  Concrete, bounded, release-quality work — but docs/polish, not new surface.
- **Greenfield agent-track skills** — the `acture-greenfield` foundation exists;
  per-step skills (state-model walkthrough, a worked greenfield bootstrap) do
  not. Lower priority until the consumer-skill family is fuller.

Use `AskUserQuestion` to settle which one (or two) to ship. Don't guess — the
last session's handoff made the scope decision explicit and it paid off.

## Step 2 — Build, per the positioning

Whatever Step 1 picks, the standing constraints hold:

- **Core enables; packages are separate and optional.** If the increment is
  consumer skills: each skill must document the **agent-written path**, name the
  realistic **tool-library choices** as the user's, and frame any `acture-*`
  package as the opt-in accelerator — per `acture-consumer-integration`. Use the
  `acture-macros` / `acture-e2e` skills (v1.7) as the template for shape and tone.
- **Hard-don'ts bind.** Re-read the checklist before merging. The positioning
  check (merge-ritual #6) is not optional.
- **Rule of three.** Don't add a package, a field, or a feature without three
  concrete callers.

## Step 3 — Wrap up

- `pnpm -r build && pnpm -r test && pnpm -r typecheck` green across the
  workspace; example apps still build + pass.
- Changesets: `minor` for any new or changed package. (Skills + docs alone need
  no changeset.)
- Update `docs/roadmap.md`: mark the increment done, record what was built and
  any decisions, refresh the "Next" section and the tracking table.
- Write a short reflection (`docs/v1_8-reflection.md` or similar — keep it short).
- Replace this file with the handoff for whatever the roadmap says is next.

## Note — publishing state

16 packages in the workspace. 15 are live on npm (2026-05-14);
**`acture-e2e-playwright`** (new in v1.7) ships with the next release. Pending
changesets: v1.6's `tier-warnings` extraction (`acture` + `acture-devtools`,
both `minor`) and v1.7's `acture-e2e-playwright` (`minor`). Nothing to publish
before starting; the next release goes out when those are versioned.

v1.7 fixed a pre-existing changeset misconfiguration that had `changeset status`
reporting a spurious suite-wide `2.0.0` major bump (peer-dep major cascade + a
drifted `fixed` group — full write-up in `docs/escalations.md`). The release
math is now correct and **`changeset version` is safe to run**: it produces
`acture` 1.2.0, `acture-devtools` 1.1.0, `acture-e2e-playwright` 1.1.0, nothing
else. If you'd prefer `acture-e2e-playwright` to debut at `1.0.0` instead, delete
`.changeset/e2e-playwright-macros.md` before versioning.

## When unsure

Re-read `docs/positioning.md` and `docs/roadmap.md`. If a change is irreversible
or you cannot tell whether it honours the positioning, append to
`docs/escalations.md` (create if missing) and ask the user.

**Good luck.** Step 1 is the only real decision this session — pick a bounded
increment, settle it with the user, then Step 2/3 are routine.
