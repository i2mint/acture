# Escalations

Open questions and pre-existing issues surfaced during increments that need a
user decision before they can be resolved. Append; don't rewrite history.

---

## 2026-05-14 (v1.7) — `changeset status` reported a spurious suite-wide `2.0.0` major bump

**Status:** ✅ **resolved (v1.7).** Settled with the user; the fix is applied.

**Symptom.** `npx changeset status --verbose` reported the *entire* package suite
bumping to **`2.0.0` (major)** when the pending changesets were versioned — even
though every pending changeset was `minor`. Confirmed pre-existing: reproduced
with *only* the v1.6 changeset present, before any v1.7 change.

**Root cause (two compounding causes).**

1. **Peer-dependency major cascade — the primary cause.** Every adapter declared
   `peerDependencies: { acture: "workspace:*" }`. Changesets' default
   (`onlyUpdatePeerDependentsWhenOutOfRange: false`) bumps a package as **major**
   whenever *any* of its peer dependencies bumps at all. `workspace:*` compounds
   it — Changesets treats it as an exact pin, so every core bump is "out of
   range." Result: any `acture` core release force-majored all 13 packages that
   peer-depend on it.
2. **The `fixed` changeset group — the secondary cause.** The `fixed` group in
   `.changeset/config.json` had members drifted across two versions (`acture` /
   `acture-migration` at `1.1.0`; eight others at `1.0.0`), so it dragged the
   group to a unified version and amplified the major cascade.

**Fix applied (v1.7).**

1. Loosened `peerDependencies.acture` from `workspace:*` to **`^1.0.0`** across
   all 13 adapter packages (`devDependencies.acture` stays `workspace:*` for
   local workspace linking). `^1.0.0` is the correct, less-strict peer range —
   the previously-published packages shipped an *exact* pin, which was a bug.
2. Added `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH:
   { onlyUpdatePeerDependentsWhenOutOfRange: true }` to `.changeset/config.json`
   — so a core *minor* (in range of `^1.0.0`) no longer force-majors dependents;
   a core *major* (out of range) still correctly flags them.
3. Dropped the `fixed` group (`fixed: []`). Every package now versions
   independently — which 6 of the 16 packages already did, and which matches
   `docs/positioning.md` (independently-optional à-la-carte packages). The real
   core↔adapter coupling is handled by `updateInternalDependencies: "patch"`.
4. Added `acture-example-redux-wrap` to the `ignore` list (it was the only
   example package missing from it — a pre-existing oversight).

**Result.** `changeset status` now reports exactly the intent: `acture`
1.1.0→1.2.0, `acture-devtools` 1.0.0→1.1.0, `acture-e2e-playwright` 1.0.0→1.1.0,
no major bumps, no unintended cascade. The published-package metadata change
(strict pin → `^1.0.0`) is non-breaking.

**Note for the next release:** `changeset version` is now safe to run.
