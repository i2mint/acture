import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { noStaleWrapMutation } from './no-stale-wrap-mutation.js';

// Wire ESLint's RuleTester into vitest so each case shows up as its own
// test. RuleTester looks for these statics; vitest doesn't expose them as
// globals unless `globals: true`, so we hand them over explicitly.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-stale-wrap-mutation', noStaleWrapMutation, {
  valid: [
    // Result is assigned and then referenced — wrapper is load-bearing.
    `import { wrapMutation } from 'acture-migration';
     const onSave = wrapMutation(handleSave, { registry });
     button.addEventListener('click', onSave);`,

    // Result is exported — may be called from another file.
    `import { wrapMutation } from 'acture-migration';
     export const onSave = wrapMutation(handleSave, { registry });`,

    // Result is exported via a specifier — the specifier counts as a use.
    `import { wrapMutation } from 'acture-migration';
     const onSave = wrapMutation(handleSave, { registry });
     export { onSave };`,

    // Result is returned — still in use.
    `import { wrapMutation } from 'acture-migration';
     function make() { return wrapMutation(handleSave, { registry }); }`,

    // Result is passed as an argument — still in use.
    `import { wrapMutation } from 'acture-migration';
     register(wrapMutation(handleSave, { registry }));`,

    // No import of wrapMutation — not our function, stay quiet.
    `wrapMutation(handleSave, { registry });`,

    // wrapMutation imported from a different module — not acture's.
    `import { wrapMutation } from './local-utils';
     wrapMutation(handleSave, { registry });`,

    // Namespace import — member-expression callee is not tracked.
    `import * as m from 'acture-migration';
     m.wrapMutation(handleSave, { registry });`,

    // Custom module option configured, but the import is from elsewhere.
    {
      code: `import { wrapMutation } from 'acture-migration';
             wrapMutation(handleSave, { registry });`,
      options: [{ module: '@myorg/legacy-migration' }],
    },
  ],

  invalid: [
    // Bare expression statement — result discarded entirely.
    {
      code: `import { wrapMutation } from 'acture-migration';
             wrapMutation(handleSave, { registry });`,
      errors: [{ messageId: 'staleWrapper' }],
    },

    // Assigned to a local, non-exported binding that is never used.
    {
      code: `import { wrapMutation } from 'acture-migration';
             const onSave = wrapMutation(handleSave, { registry });`,
      errors: [{ messageId: 'staleWrapper' }],
    },

    // Aliased import — track the local name.
    {
      code: `import { wrapMutation as wm } from 'acture-migration';
             wm(handleSave, { registry });`,
      errors: [{ messageId: 'staleWrapper' }],
    },

    // Custom module option — wrapMutation re-exported under another name.
    {
      code: `import { wrapMutation } from '@myorg/legacy-migration';
             wrapMutation(handleSave, { registry });`,
      options: [{ module: '@myorg/legacy-migration' }],
      errors: [{ messageId: 'staleWrapper' }],
    },

    // Multiple stale wrappers in one file — one report each.
    {
      code: `import { wrapMutation } from 'acture-migration';
             wrapMutation(addTodo, { registry });
             const unused = wrapMutation(removeTodo, { registry });`,
      errors: [{ messageId: 'staleWrapper' }, { messageId: 'staleWrapper' }],
    },

    // Inline handler, result discarded — still stale.
    {
      code: `import { wrapMutation } from 'acture-migration';
             wrapMutation(() => store.save(), { registry });`,
      errors: [{ messageId: 'staleWrapper' }],
    },

    // Import declaration appears after the call (legal at module scope) —
    // the deferred Program:exit check still resolves it.
    {
      code: `wrapMutation(handleSave, { registry });
             import { wrapMutation } from 'acture-migration';`,
      errors: [{ messageId: 'staleWrapper' }],
    },
  ],
});
