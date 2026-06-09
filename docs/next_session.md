# Next Session — pick the next post-v1 increment (user-steered)

**Your role this session:** *one* of two things.

1. **If the user says "ship X":** read the X-specific brief below and run a single-increment session (Step 1 design decision → build → test → changeset → roadmap update → reflection → commit → push → merge Version PR → verify publish → pull bump). Mirror the v1.12 + v1.13 workflow exactly.
2. **If the user hasn't picked yet:** surface the three remaining post-v1 options below via `AskUserQuestion`. **Do not pick autonomously.** v1.12 + v1.13 were a pre-committed chain; everything past v1.13 is a fresh decision the user owns.

The autonomous-chain mode from the previous handoff is **off** by default. If the user says "do v1.14 + v1.15 autonomously" or similar, re-enter that mode with the same "truly stuck" criteria the v1.12 handoff defined.

## Outcomes of the previous chain

- **v1.12 — `acture-test-property@1.1.0`** — fast-check arbitraries over the command registry; random `CommandSequence`s replayed via `acture-e2e-playwright`'s `replaySequence`; invariants asserted end-of-sequence. Counter-examples carry the shrunk sequence on `PropertyTestFailure.sequence` (replayable verbatim). +29 tests. In-package Zod→arbitrary mapper covering the JSON-Schema-representable subset (the spec-listed `@fast-check/zod` package does not exist on npm). Consumer skill: `acture-test-property`. Reference: `docs/hand-written-test-property.md`. Full write-up: `docs/v1_12-reflection.md`.
- **v1.13 — `acture` on PyPI** — Python companion graduated from name-reservation placeholder to a real, thin MCP-client facade. `ActureClient(Mapping[str, Command])`, `Command`, `ActureError`, `stdio_transport` / `http_transport`. ~300 LoC. One dependency (`mcp >= 1.10`). +23 Python tests via the SDK's in-memory transport. Cross-language semver = lockstep (existing `sync-python-version.mjs`), deliberately not decoupled in this increment. Consumer skill: `acture-python`. Reference: `docs/hand-written-python-client.md`. Full write-up: `docs/v1_13-reflection.md`.
- **Status now:** 19 npm packages + 1 PyPI package; **489 npm package tests + 41 example tests + 23 Python tests** green. 26 skills, 7 reproducibility / recipe docs. Pending changesets: none — chain end is fully published.

## The three remaining post-v1 candidates

Pick one (or none). Each has honest trade-offs — they are NOT equally cheap, and none of them is the obvious next move.

### Option A — `acture-state-jotai` (additional `StateAdapter<S>` reference)

Adds a third reference state adapter. Jotai is **atom-tree**, not flat-state — every piece of state is its own primitive atom. The `StateAdapter<S>` interface assumes flat state (`getState(): S`, `setState((s) => …)`).

- **Effort:** the atom-tree-to-flat bridge has to either (a) flatten the atom tree into a single derived atom (loses Jotai's atomic-update benefit), or (b) introduce an "atom selector function" the adapter user supplies. Research-3 §3 flagged this; the implementation friction is real.
- **`PatchCapableAdapter`:** **may not implement cleanly.** Jotai mutations don't naturally produce Immer-style patches; the adapter would need to wrap every `set` and synthesize a patch from the before/after diff — expensive at large state.
- **Trade-off vs. alternatives:** Jotai is genuinely popular; users who already chose Jotai will want it. But the adapter would either compromise Jotai's strengths (option a) or push complexity onto the user (option b).
- **Recommended user-side decision:** "do we have a real Jotai consumer asking for this?" If no, defer.

### Option B — `acture-state-valtio` (additional `StateAdapter<S>` reference)

Same shape as A, different substrate. Valtio is **proxy-based** — mutations look like direct property assignment, and the proxy synthesizes update notifications.

- **Effort:** proxy-to-patch translation is non-trivial. Valtio's `subscribe` fires after the mutation has already happened; to emit Immer-style patches the adapter would have to do a structural diff against a captured pre-state snapshot, like the Jotai option (b) above.
- **`PatchCapableAdapter`:** same constraint as A — synthesizable but expensive at large state.
- **Trade-off vs. alternatives:** Valtio is less popular than Jotai but has a dedicated user base. The proxy approach is incompatible with the JSON-serializable state constraint (`acture-greenfield-state-model`'s four hard constraints) only at the structural-clone boundary; not a blocker, but a thing to document.
- **Recommended user-side decision:** "do we have a real Valtio consumer?" If no, defer.

### Option C — `acture-sandbox` ✅ shipped (the extension-system increment)

**Done.** The gating design is filed as research-9 (`docs/research/acture_research_9 -- Extensions and Plugin Systems.md`, the §7 brief); the maintainer overrode its honest no-named-user NO-GO to build the **isolation-only seam**. Shipped: the `acture-extensions` skill, `docs/hand-written-sandbox.md` (the ~15-line core-only host/loader pattern), and the `acture-sandbox` package — which ships *only* the `ExtensionRunner` port + an in-process transport.

- **What's settled:** the trust-tier model (research-9 Axis A), effects-as-data, the host/loader as a pattern (the `CommandRecord` IS the manifest), and isolation as the one rung that earns a package.
- **What stays deferred** (the genuine untrusted-author work): the real isolating transports (Worker / iframe / QuickJS-WASM / `isolated-vm`), CPU/memory quotas, and the capability/manifest/entitlement/marketplace layers — gated on a real untrusted-author user (research-9 §0).

### A fourth option — none of the above

Either the user has a different priority (a backlog item, a bug, a docs gap, a research question), or the suite genuinely is at a stable point and the next increment is "wait for real user feedback." Stable-and-waiting is a valid outcome of finishing v1; don't pull-forward speculative work just to keep shipping.

## How to surface the choice

When the user opens a session with "what's next" / "pick the next increment" / similar, ask via `AskUserQuestion`:

- **Header:** `Next increment`
- **Question:** "Two post-v1 state-adapter options remain. Which (if any) should we schedule next?"
- **Options:**
  1. **`acture-state-jotai`** — Jotai adapter. Real implementation friction per research-3; needs a concrete consumer before pulling forward.
  2. **`acture-state-valtio`** — Valtio adapter. Same friction class as Jotai; same gate.
  3. (Other — let the user type a backlog item or a fresh ask.)

  (`acture-sandbox` is no longer an option — its isolation-only seam shipped in the extension-system increment. The next sandbox work is gated on a real untrusted-author user.)

If the user picks 1 or 2, run a normal increment (Step 1 = `AskUserQuestion` on adapter-specific design choices — the atom-tree-vs-flat-state choice for jotai, the diff-vs-proxy-subscribe choice for valtio). If the user picks 3, **do not write package code** — propose a research-7 prompt first.

## Standing constraints (unchanged from v1.12)

- **`docs/positioning.md` is canonical.** Section 1 now names three delivery surfaces (skills/patterns, npm packages, PyPI). Each new package documents its hand-written equivalent in `docs/hand-written-*.md`.
- **`docs/redesign_takeaways.md` §6.** The rule of three is for acture *users*. For maintainer decisions, the principles are YAGNI / wait for a concrete named need, hard-don't #2 (no god-package), and the dev-tool-first principle. No callers-counting gate.
- **Hard-don'ts bind** (`acture-hard-donts` skill). For an adapter increment, #1 (no inner-platform DSL), #2 (no god-package), #3 (translate, don't decide) are the load-bearing ones.

## Publishing state at chain end

19 npm packages live on npm; 1 PyPI package live on PyPI (the real `acture` client, replacing the placeholder). No pending changesets. Release workflow has worked cleanly for v1.7 through v1.13; reuse the pattern. The "Publish Python stub to PyPI" job is now mis-named — it publishes the real client. Renaming is a cosmetic future PR.

## When unsure

Re-read `docs/positioning.md`, `docs/redesign_takeaways.md` §6, `docs/roadmap.md`, and the v1.11 / v1.12 / v1.13 reflections. If a change is irreversible, append to `docs/escalations.md` and ask the user.

**The autonomous chain is over.** From here, the user steers.
