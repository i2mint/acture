# acture-codemods

> **acture is a development tool first.** This is dev/build-time tooling — it never becomes a runtime dependency of the apps it serves, and using it is entirely optional. See [`docs/positioning.md`](../../docs/positioning.md).

Codemod CLI for adopting acture in an existing TypeScript/React codebase. Single `npx`-invokable runner with a manifest of shipped transforms.

Research-4 §B.5 plans five codemods; v1.3 ships **all five**. v1.2 was the first two; v1.3 added the remaining three.

## Quick start

```bash
# List shipped codemods
npx acture-codemods --list

# Dry-run on a directory, emit JSON for an agent to read
npx acture-codemods wrap-handler-with-mutation \
    --target src/ --dry-run --json

# Apply for real
npx acture-codemods wrap-handler-with-mutation --target src/
```

## Shipped codemods

| Codemod | Since | What it does |
| --- | --- | --- |
| `wrap-handler-with-mutation` | 1.0.0 | Wraps `onClick` / `onChange` / `onSubmit` handler expressions with `wrapMutation(...)`. Adds the import if missing. Idempotent. |
| `extract-onclick-to-command` | 1.0.0 | Lifts inline arrow handlers into module-level `defineCommand` calls. Replaces the JSX with a `registry.dispatch` reference. Conservative — skips handlers with parameters. |
| `redux-action-to-command` | 1.1.0 | Convert `dispatch({type, payload})` call sites to `registry.dispatch(id, payload)`. Skips non-literal types and action objects with extra keys. Optional slash→dot id rewrite. |
| `usestate-mutation-to-command` | 1.1.0 | Wraps inline handlers whose body is composed of `setX(...)` setter calls with `wrapMutation`, deriving a command id from the setter name. Configurable setter pattern. |
| `rtk-thunk-to-command` | 1.1.0 | Convert `createAsyncThunk(id, payloadCreator)` into `defineCommand({id, title, execute})`. Rewrites `return X` to `return ok(X)`. Skips thunks with an options arg. |

## CLI

```text
acture-codemods <name> --target <path> [--dry-run] [--json] [--option key=value]
acture-codemods --list
acture-codemods --manifest
acture-codemods --help
```

Two paths for agents driving codemods:

```bash
# Iterate dry-run → review → apply
acture-codemods <name> --target <dir> --dry-run --json | jq ...
acture-codemods <name> --target <dir> --json
```

`--dry-run` returns the diff the codemod *would* produce without writing files (research-4 §B.6 requirement). `--json` makes the output machine-readable.

## Programmatic API

```ts
import { runCodemod } from 'acture-codemods';

const result = await runCodemod('wrap-handler-with-mutation', {
  files: ['src/Button.tsx', 'src/Form.tsx'],
  dryRun: true,
  options: { events: 'onClick,onSubmit' },
});

for (const f of result.files) {
  if (f.changed) console.log(f.path, '\n', f.after);
}
```

## Design principles

1. **Conservative.** When in doubt, skip the file. The 100% successful rewrite that touches 60% of files is worth more than the 80% successful rewrite that touches all of them. (Research-4 §B.6.)
2. **Single tool — ts-morph.** Research-4 §B.2 compares jscodeshift, ts-morph, ast-grep, and semgrep. We picked ts-morph because: TypeScript-aware API surface, pure-JS dependency, and AST manipulation that maps cleanly to the kinds of transforms acture needs.
3. **`--dry-run` and `--json` are mandatory** on every codemod. Agents preview, then apply.
4. **No global config.** Codemod options come from `--option key=value` on the CLI or the `options` field of `runCodemod`. The package itself has zero runtime config files.

## Hard-don'ts

- **No business logic.** Codemods translate code to code. They do not decide which commands are right, when to migrate, or how to author the spec — those are user decisions.
- **No "smart" rewrites that need type info we can't get.** When the transform would need to read a generic parameter or infer a return type, we skip and emit a note. (Research-4 §B.2: ts-morph has type info, but every codemod we ship documents which path it uses — purely structural vs. type-aware.)
- **No surprise installs.** The codemods write code that imports `acture` / `acture-migration`. They do NOT run `npm install` or modify `package.json`. The user installs deps themselves.

## See also

- `docs/research/acture_research_4 -- Transitional APIs and Codemod Tooling…` §B.5, §B.6
- `acture-migration` for the runtime-only adoption surface (`wrapMutation`, `actureMiddleware`, `createDomInterceptor`, …)
- `.claude/skills/migration-wrap/SKILL.md` for the agent workflow that drives these codemods
