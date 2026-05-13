---
name: migration-diagnose
description: Scan an existing codebase for acture command candidates — event handlers, store actions, async thunks, API calls. Use when a Claude Code agent is starting to adopt acture in an app that already has its own state library and UI. Triggers on "diagnose", "find command candidates", "what should I wrap", "audit handlers", "scan for migration". First skill in the migration track (diagnose → plan → scaffold → wrap → graduate). Does NOT modify any files.
---

# migration-diagnose

The first step of the strangler-fig adoption track. Produce a structured report of every function, event handler, store action, or API call that is a candidate for wrapping as an acture command.

**Read-only.** No source files are modified.

## Inputs

- The target codebase root.
- (Optional) An `acture.config.json` at the repo root with `prefix` (default `app`) and category hints.

## Output

Write `acture-output/diagnosis.md` containing:
1. A one-line summary (state library, store count, candidate count).
2. A per-store table of actions.
3. A list of top-priority candidates (≥10 if available), each with proposed command id, current location, params shape, complexity, and priority.
4. A "skip" list (handlers we intentionally don't wrap — e.g. trivial local UI toggles).

Optionally also write `acture-output/diagnosis.json` if downstream tooling consumes it.

## Steps

### 1. Detect state library

Search `package.json` dependencies and source code:

| Library | dep | source pattern |
|---|---|---|
| Zustand | `zustand` | `create(`, `createStore(` |
| Redux Toolkit | `@reduxjs/toolkit` | `createSlice(`, `configureStore(` |
| Redux (classic) | `redux` | `createStore(`, `combineReducers(` |
| Jotai | `jotai` | `atom(`, `useAtom(` |
| Valtio | `valtio` | `proxy(` |
| MobX | `mobx` | `makeAutoObservable(` |
| React only | — | `useState(`, `useReducer(` |

Record what you find. Most apps have one primary library plus React local state.

### 2. Locate stores / slices

For each detected library, find the store/slice files and enumerate the actions. For zustand, actions are methods inside the `create((set, get) => ({...}))` shape. For RTK, they are the `reducers:` keys of `createSlice`. Capture for each: file path, action name, parameter shape (from the TS signature if present), sync/async.

### 3. Find event handlers that mutate state

Grep for the high-signal patterns:

```
onClick={, onChange={, onSubmit={, onKeyDown={, onDrop={, onSelect={
```

For each match, decide:
- Does it call a store action / API? → **candidate**
- Does it only flip local UI state (`setIsOpen(...)`)? → **skip**
- Does it call multiple actions composed inline? → **candidate** (wrap the composition as one command)

### 4. Find API calls

`fetch(`, `axios.`, `.useQuery(`, `.useMutation(`, `.mutate(`, `gql\``. For each: endpoint or procedure name, input shape, sync/async, side-effecting?

### 5. Find pre-existing command-like patterns

Spot prior art the host already has — these are usually the highest-value candidates:

```
hotkeys(, tinykeys(, useHotkeys(            // keyboard
<CommandDialog, <KBarProvider, useKBar(     // palette
dispatch(, .execute(                         // central dispatchers
```

If the app already has a command palette or a hotkeys table, those entries are the canonical list of "things users invoke." Wrap them first.

### 6. Classify each candidate

For every item from steps 2–5 build an entry:

- **Proposed id:** `{prefix}.{domain}.{action}` (lowercase camelCase, e.g. `app.todo.add`).
- **Current location:** `path/to/file.ts:LINE`.
- **Params:** from the TS signature, or `none`.
- **Complexity:** `simple` (sync, ≤1 primitive param) / `moderate` (Zod schema or API call) / `complex` (multi-step, error paths, side effects).
- **Priority (1–5):**
  - 5: user-facing, called from ≥3 surfaces, core to the app's purpose.
  - 4: user-facing, called from 2 surfaces.
  - 3: user-facing, called from 1 surface.
  - 2: internal action that would benefit from telemetry / tests.
  - 1: utility unlikely to need multiple surfaces.

### 7. Write the report

`acture-output/diagnosis.md` should have these sections:

```
# Diagnosis

**State library:** zustand
**Stores found:** 1 (src/store.ts — todos)
**Total candidates:** 8
**Priority ≥ 4:** 5

## Stores

| Store | Actions | File |
|---|---|---|
| todos | addTodo, toggleTodo, removeTodo, clearDone | src/store.ts |

## Top candidates

| # | Proposed id | Location | Params | Complexity | Priority |
|---|---|---|---|---|---|
| 1 | app.todo.add | src/store.ts:42 | `{text: string}` | moderate | 5 |
| 2 | app.todo.toggle | src/store.ts:51 | `{id: string}` | simple | 4 |
| ... | | | | | |

## Skipped

- `setIsOpen` in src/Modal.tsx — local UI state only, not a candidate.
```

## Validation

Before finishing, check:

- [ ] Every store file is enumerated.
- [ ] Every handler that calls a store action is captured as candidate or skip.
- [ ] Every proposed id matches `^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$` (acture's id regex).
- [ ] No source files were modified.
- [ ] The report is in `acture-output/` and is readable as the input to `migration-plan`.

## Hand-off

After this, run `migration-plan` to phase the candidates into a backlog. Do NOT jump to `migration-wrap` without a plan — the plan keeps the agent honest about Phase 1 / Phase 2 ordering and dependencies.
