/**
 * Acture core — Phase 0 smoke-test export.
 *
 * v0.0.0 ships only this frozen-record stub to validate the build/test
 * pipeline. The full `defineCommand`, registry, dispatcher, when-clause DSL,
 * and schema bridge land in Phase 1 per `docs/implementation_plan.md`.
 */

export type CommandSpec<P = unknown, R = unknown> = {
  readonly id: string;
  readonly title: string;
  execute: (params: P, ctx: unknown) => R | Promise<R>;
};

/**
 * Phase-0 placeholder for `defineCommand`. Freezes its input and returns it.
 * Type-safe but feature-empty: no registry, no validation, no dispatch.
 *
 * Phase 1 reshapes this against the full `CommandRecord` shape in
 * `docs/v1_plan.md` §4.
 */
export function defineCommand<P, R>(
  spec: CommandSpec<P, R>,
): Readonly<CommandSpec<P, R>> {
  return Object.freeze({ ...spec });
}

export const __version = '0.0.0' as const;
