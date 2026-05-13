# Migration worked example — zustand-wrap

A small notes app demonstrating the strangler-fig adoption of acture in an existing zustand-based React app.

```
zustand-wrap/
├── before/    # The host app — no acture imports anywhere.
└── after/     # Same host, plus a command palette (Ctrl/Cmd+K), 5+ wrapped
              # commands, and 2 graduated to direct `defineCommand`.
```

The `after/` app behaves identically to `before/` from the user's perspective, plus the palette. Every wrapped command dispatches against the SAME zustand store the legacy UI uses — there is no duplicated state.

## What this example exercises

1. **`migration-diagnose`** — the candidate list is captured in `after/acture-output/diagnosis.md`.
2. **`migration-plan`** — `after/acture-output/plan.md`.
3. **`migration-scaffold`** — `after/src/acture/{registry,state,index}.ts`.
4. **`migration-wrap`** — five commands under `after/src/acture/commands/`.
5. **`migration-graduate`** — two commands graduated to direct `defineCommand` (the wrapper is gone, the legacy store action is gone, the body lives in `execute`).

## Parameterized command shapes

The `after/` app deliberately registers five parameterized commands of varying shapes so the auto-derived `kind` heuristic gets stressed against the kinds of params real apps have:

| Command | Params | Expected kind |
| --- | --- | --- |
| `app.settings.setTheme` | `{ theme: enum }` | atomic |
| `app.settings.setFontSize` | `{ size: number }` | handoff |
| `app.note.add` | `{ title: string }` | handoff |
| `app.note.setDueDate` | `{ id: string, date: string }` | handoff |
| `app.note.setBody` | `{ id: string, body: string }` | handoff |

Override rate: 0/5. See `after/src/kind-heuristic.test.ts` for the assertions and `docs/phase-3-reflection.md` §1 for the analysis.

## Running

```bash
# The "before" app
cd before && pnpm dev      # http://localhost:5181

# The "after" app
cd after && pnpm dev       # http://localhost:5182
```

Tests run via `pnpm test` in either directory.
