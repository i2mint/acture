/**
 * `chooseImplementation` — 5-line legacy/modern router.
 *
 * Composes with any feature-flag SDK (LaunchDarkly, Statsig, Unleash,
 * `@vercel/flags`, env-var lookups, anything). The `pick` callback runs
 * on every invocation, so the route can change at runtime as the flag
 * value flips. There is no caching; if you need it, cache `pick`
 * yourself.
 *
 * Per `acture-migration-package` skill §"What `chooseImplementation`
 * does": this is the thin replacement for the dropped `divertHandler`.
 * Predicate-based routing is the user's problem, not acture's.
 *
 * @example
 *   const submit = chooseImplementation(
 *     () => flags.use('new-checkout') ? 'modern' : 'legacy',
 *     { legacy: oldSubmit, modern: newSubmit },
 *   );
 */
export function chooseImplementation<Args extends unknown[], R>(
  pick: () => 'legacy' | 'modern',
  impls: {
    legacy: (...args: Args) => R;
    modern: (...args: Args) => R;
  },
): (...args: Args) => R {
  return (...args: Args): R => impls[pick()](...args);
}
