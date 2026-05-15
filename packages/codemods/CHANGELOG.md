# acture-codemods

## 1.2.0

### Minor Changes

- 4ad3790: CLI + README polish (closes the v1.4 fresh-agent release-gate findings). The single ambiguous "No files matched" error is now three distinct messages — no `--target`/`--files-from` given, a path that does not exist (likely a typo), or a path that exists but holds no `.ts`/`.tsx`/`.jsx` files. `--help` gained a Modes section (`--list`/`--manifest`), an Exit codes section, and a pointer to the README for per-codemod option keys. The README now documents every `--option` key for all five codemods, `--manifest` vs `--list`, `--files-from`, exit codes, and the from-a-clone invocation.
