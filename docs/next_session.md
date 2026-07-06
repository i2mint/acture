# Next Session — user-steered

**Your role:** the v1.14–v1.18 consumer-gap chain is complete. From here the user
steers. Do **not** pick new package work autonomously — surface options with honest
trade-offs. Mirror the v1.15–v1.17 single-increment workflow (Step 1 design decision
→ build → test → changeset → roadmap → reflection → commit → PR → merge Version PR →
verify publish) when the user picks a package increment.

## What just shipped (v1.14 → v1.18)

The three consumer surfaces the user was about to implement — **command palette**,
**keyboard-shortcut customization**, and an **app-operating AI assistant** — were
gap-filled end to end. Command palette was already covered; the other two are now
complete.

- **v1.14 — research + skills + reference docs** (PR #41): `research_10` (end-user
  keybinding customization) + `research_11` (AI assistant operating an app,
  Vancouver-cited); new `acture-ai-assistant` skill; extended `acture-hotkeys`
  skill; 3 `hand-written-*` refs (`keymap-override`, `view-registry`,
  `assistant-runtime`). Adversarially reviewed; 8 correctness fixes applied.
- **peer-range republish** (PR #42): `acture-palette-react` / `acture-hotkeys` /
  `acture-state-zustand` **1.0.1** — fixed the ERESOLVE exact-pin on `acture`.
- **v1.15 — MCP resources** (PR #44): `acture-mcp-server@1.2.0` — the AI read side
  (`createMcpServer({ views })` → `resources/list`/`read`/`subscribe`).
- **v1.16 — getState tool** (PR #46): `acture-mcp-server@1.3.0` — the portable
  read-side hedge for tools-only hosts (serves reelee-web's direct-Anthropic flow).
- **v1.17 — keymap customization** (PR #48): `acture-hotkeys@1.1.0` — end-user
  remapping (`bindHotkeys({ keymap })` + `resolveKeys`/`detectConflicts`/capture &
  display primitives).
- **v1.18 — confirmation gate** (PR #50): HITL for destructive AI dispatch, shipped
  as a **pattern** (middleware+convention, not `CommandRecord` fields; hard-don't
  #2). Complete secure impl in `docs/hand-written-assistant-runtime.md` Piece 1.

**The "operate my app" story is complete:** write side (tools/MCP) + read side
(resources + getState) + HITL confirmation + macro capture + runtime bridge — as
packages where a package earned it, as patterns/skills elsewhere.

**Named consumer:** `reelee-web` (its `src/ai/acture-tools.ts` bridges the registry
to Anthropic tools and classifies destructive commands) grounds all of the above.

## Candidates next (user's call)

1. **Wire the shipped pieces into `reelee-web`** — palette, hotkeys + keymap
   customization, MCP resources + getState, and the confirmation-gate pattern. This
   is the natural "use what we built" move; the named consumer is ready.
2. **`acture-state-jotai` / `acture-state-valtio`** — the remaining post-v1 state
   adapters. Still gated on a real Jotai/Valtio consumer (research-3 friction; may
   not implement `PatchCapableAdapter` cleanly). Defer unless a consumer surfaces.
3. **Stable-and-waiting** — a valid outcome. Don't pull-forward speculative work.

If the confirmation gate ever needs to be an *importable* helper (not a copied
pattern) because a second project reuses it, revisit the pattern-vs-package call —
but honor hard-don't #2 (no god-package-of-one; find an existing home first).

## Standing constraints (unchanged)

- **`docs/positioning.md` is canonical** — dev-tool-first; each package documents its
  hand-written equivalent in `docs/hand-written-*.md`.
- **`docs/redesign_takeaways.md` §6** — rule of three is for acture *users*; for
  maintainer decisions: YAGNI / named need, hard-don't #2 (no god-package),
  dev-tool-first.
- **Hard-don'ts bind** (`acture-hard-donts`). The closed `CommandRecord` stays
  closed unless a change passes the named-need test (the confirmation gate
  deliberately used convention over fields to honor this).
- Release workflow (changesets → Version PR → publish) has run cleanly for
  #42/#44/#46/#48; reuse the pattern.

## When unsure

Re-read `docs/positioning.md`, `docs/redesign_takeaways.md` §6, `docs/roadmap.md`
(the v1.14–v1.18 entries), and the `acture-ai-assistant` / `acture-hotkeys` /
`acture-mcp` skills. If a change is irreversible, append to `docs/escalations.md`
and ask the user.
