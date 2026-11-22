---
"acture": minor
---

`defineCommand` keeps the literal `id` type: `CommandRecord` and `CommandSpec` take a third type parameter `Id extends string = string`, so a host can derive `type CommandId = (typeof allCommands)[number]['id']`. Existing code, including explicit `defineCommand<P, R>` calls, is unaffected.
