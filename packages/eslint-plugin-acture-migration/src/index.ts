/**
 * `eslint-plugin-acture-migration`
 *
 * One rule, one job: catch strangler-fig migrations that have graduated
 * but still carry their `wrapMutation` scaffolding. See the rule's own
 * file and the package README for the detection contract.
 *
 * Flat-config usage (ESLint 9+):
 *
 *   import acture from 'eslint-plugin-acture-migration';
 *
 *   export default [
 *     {
 *       plugins: { acture },
 *       rules: { 'acture/no-stale-wrap-mutation': 'warn' },
 *     },
 *   ];
 *
 * Or pull in the bundled config:
 *
 *   import acture from 'eslint-plugin-acture-migration';
 *   export default [acture.configs.recommended];
 */

import type { ESLint, Linter } from 'eslint';
import { noStaleWrapMutation } from './rules/no-stale-wrap-mutation.js';

const rules = {
  'no-stale-wrap-mutation': noStaleWrapMutation,
} satisfies ESLint.Plugin['rules'];

const plugin: ESLint.Plugin = {
  meta: {
    name: 'eslint-plugin-acture-migration',
    version: '1.0.0',
  },
  rules,
};

const recommended: Linter.Config = {
  plugins: { acture: plugin },
  rules: { 'acture/no-stale-wrap-mutation': 'warn' },
};

plugin.configs = { recommended };

export default plugin;
export { rules, noStaleWrapMutation };
