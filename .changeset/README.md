# Changesets

Hello and welcome! This folder is managed by `@changesets/cli`. Full docs: https://github.com/changesets/changesets.

## Workflow for this repo

The ten publishable packages — `acture`, `acture-state-zustand`, `acture-state-redux`, `acture-palette-react`, `acture-hotkeys`, `acture-forms-autoform`, `acture-forms-rjsf`, `acture-mcp`, `acture-ai-vercel`, `acture-migration` — share a **fixed** version (see `config.json`). When any of them changes, all ten get a matching bump.

Add a changeset to any non-trivial PR:

```bash
pnpm changeset
```

Pick the packages affected, choose `patch` / `minor` / `major`, and write a one-line description. The resulting `.changeset/*.md` file goes into the PR.

On merge to `main`, the release workflow opens (or updates) a "Version Packages" PR that consumes pending changesets and bumps versions. Merging that PR triggers the npm + PyPI publish.

## The 0.x quirk — use `patch` until v1.0.0

During the `0.x` line, **always use `patch`** as the changeset type. A `minor` changeset on a `0.x` version overshoots straight to `1.0.0` (changesets default behavior: in pre-1.0 land it treats `minor`-marked changes as the breaking-out-of-prerelease moment).

Since `v1.0.0` is reserved for the post-Phase-4 milestone, `patch` is the only safe level until we deliberately cut v1.0. The mechanical rule until then:

- Non-breaking and breaking changes alike: `patch` (e.g. `0.2.0 → 0.2.1 → 0.2.2 …`).
- When ready to ship v1: bump manually in a release PR (or use `major`).
