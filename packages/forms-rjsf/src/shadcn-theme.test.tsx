/**
 * The `@rjsf` 6.x / `@rjsf/shadcn` pairing — the reason this package's peer
 * range moved (thorwhalen/acture#57). `@rjsf/shadcn` is published on the 6.x
 * line only, so a consumer on a shadcn design system needs both halves to be
 * installable together, and needs a way to hand the theme to `<RjsfForm />`.
 *
 * Kept apart from `rjsf-form.test.tsx` on purpose: that file must stay runnable
 * against a plain 5.x tree (the `rjsf5` CI job installs one), and importing
 * `@rjsf/shadcn` would make it un-collectable there.
 */

/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import ShadcnForm from '@rjsf/shadcn';
import { RjsfForm } from './rjsf-form.js';

/** The single range every `@rjsf/*` peer is declared at. */
const SUPPORTED_RJSF_RANGE = '^5.20.0 || ^6.0.0';

/** vitest runs each workspace package with its own directory as cwd, and under
 *  the jsdom environment `import.meta.url` is not a `file:` URL. */
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

/** An INSTALLED dependency's manifest. The `@rjsf/*` packages do not list
 *  `./package.json` in their `exports` map, so read it off disk. */
const installedManifest = (
  name: string,
): { version: string; peerDependencies: Record<string, string> } =>
  readJson(resolve(process.cwd(), 'node_modules', name, 'package.json'));

const majorOf = (versionOrRange: string) => versionOrRange.replace(/^[\^~>=\s]+/, '').split('.')[0]!;

const ownManifest = () =>
  readJson(resolve(process.cwd(), 'package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  };

/**
 * Assert the rendered input came from the INJECTED theme and not from
 * `@rjsf/core`'s default. `form-control` is the class `@rjsf/core`'s
 * `BaseInputTemplate` emits and no themed template does — a discriminator that
 * survives Tailwind class churn, which is why it lives here rather than being
 * spelled out per test.
 */
const expectThemedInput = (input: HTMLInputElement) => {
  expect(input).toBeTruthy();
  expect(input.className).not.toBe('form-control');
  expect(input.className).not.toContain('form-control');
};

afterEach(() => cleanup());

describe('@rjsf/shadcn as an injected theme', () => {
  const cmd = () =>
    defineCommand({
      id: 'app.t.add',
      title: 'Add via shadcn',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });

  it('renders the shadcn theme rather than the @rjsf/core default', () => {
    const { container } = render(
      <RjsfForm command={cmd()} form={ShadcnForm} onSubmit={() => {}} onCancel={() => {}} />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expectThemedInput(input);
    // shadcn's input template emits Tailwind utility classes.
    expect(input.className).toContain('rounded-md');
  });

  it('submits through the theme', async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <RjsfForm command={cmd()} form={ShadcnForm} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    // Without this the test passes on an adapter that ignores `form` entirely —
    // @rjsf/core's own form submits identically, so submission alone does not
    // distinguish the injected theme from the default.
    expectThemedInput(input);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'A' } });
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(onSubmit).toHaveBeenCalled();
    expect((onSubmit.mock.calls[0]![0] as { label: string }).label).toBe('A');
  });
});

/**
 * The defect behind #57 was a DECLARED peer range that had drifted from what
 * the package is actually written and tested against. These pin the two
 * together, so moving either is a deliberate act.
 *
 * Both halves of the range are exercised: 6.x by this dev tree and the `ci`
 * job, 5.x by the `rjsf5` job, which runs `scripts/pin-rjsf-5x.mjs` and then
 * installs a plain 5.x tree of its own. That is a second *install*; what pnpm's
 * peers-are-matched-by-name behaviour rules out is a second *alias tree inside
 * one install*, where an `npm:`-aliased 5.x `@rjsf/core` still binds the 6.x
 * `@rjsf/utils` and the "5.x matrix" is 6.x wearing a 5.x label.
 */
describe('declared @rjsf peer range', () => {
  const pkg = ownManifest();
  const declaredMajors = SUPPORTED_RJSF_RANGE.split('||').map((r) => majorOf(r.trim()));

  it.each(['@rjsf/core', '@rjsf/utils', '@rjsf/validator-ajv8'])(
    'declares %s at the one supported range',
    (name) => {
      expect(pkg.peerDependencies[name]).toBe(SUPPORTED_RJSF_RANGE);
    },
  );

  it('names the major the dev tree actually installs', () => {
    expect(declaredMajors).toContain(majorOf(installedManifest('@rjsf/core').version));
  });

  it('names the major @rjsf/shadcn peers on — the whole point of the widening', () => {
    expect(declaredMajors).toContain(
      majorOf(installedManifest('@rjsf/shadcn').peerDependencies['@rjsf/core']!),
    );
  });
});

/**
 * Hard-don't #8 (AGENTS.md merge checklist): **no bundling a UI kit.** The
 * `form` prop is the slot API that keeps that true, and `@rjsf/shadcn` is here
 * for the smoke test above and nothing else. Promoting it to `dependencies` or
 * `peerDependencies` — the obvious "make the theme just work for consumers"
 * edit — would pull radix + lucide-react + tailwind-merge + tailwindcss-animate
 * into every consumer's install, and every other test in this package would
 * stay green while it happened.
 */
describe('no UI kit reaches consumers', () => {
  const pkg = ownManifest();

  it.each(['dependencies', 'peerDependencies'] as const)(
    '@rjsf/shadcn is not in %s',
    (field) => {
      expect(pkg[field]?.['@rjsf/shadcn']).toBeUndefined();
    },
  );

  it('@rjsf/shadcn is a devDependency, so the smoke test above is real', () => {
    expect(pkg.devDependencies['@rjsf/shadcn']).toBeTruthy();
  });

  it('declares no runtime dependencies at all — everything is peered or injected', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});

/**
 * `pnpm-workspace.yaml` suppresses the missing-`tailwindcss` peer report, which
 * `@rjsf/shadcn` forces on us: it pulls `tailwindcss-animate`, whose peer range
 * is the malformed `">=3.0.0 || insiders"` — not a semver range, so pnpm calls
 * it unmet whatever is installed. pnpm offers no scoped form of the rule
 * (`tailwindcss-animate>tailwindcss` and `@rjsf/shadcn>tailwindcss` were both
 * tried; neither is honoured), so the suppression is workspace-wide and
 * permanent, and the day a workspace package genuinely peers on `tailwindcss`
 * its missing peer would go unreported. This is the compensating check.
 */
describe('the workspace-wide tailwindcss ignoreMissing rule', () => {
  const repoRoot = resolve(process.cwd(), '../..');
  const workspaceYaml = readFileSync(resolve(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const ruleIsInPlace = /ignoreMissing:[\s\S]*?^\s*-\s*tailwindcss\s*$/m.test(workspaceYaml);

  const manifests = () => {
    const roots = ['packages', 'examples'].map((d) => resolve(repoRoot, d));
    return roots
      .filter((root) => existsSync(root))
      .flatMap((root) =>
        readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => resolve(root, e.name, 'package.json'))
          .filter((p) => existsSync(p))
          .map((p) => [p, readJson(p)] as const),
      );
  };

  it('is still in pnpm-workspace.yaml (delete this block with the rule)', () => {
    expect(ruleIsInPlace).toBe(true);
  });

  it.runIf(ruleIsInPlace)(
    'no workspace package declares a tailwindcss peer while it is suppressed',
    () => {
      const offenders = manifests()
        .filter(([, pkg]) => pkg.peerDependencies?.tailwindcss)
        .map(([path]) => path);
      expect(offenders).toEqual([]);
    },
  );
});
