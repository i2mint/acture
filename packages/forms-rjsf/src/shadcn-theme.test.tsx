/**
 * The `@rjsf` 6.x / `@rjsf/shadcn` pairing — the reason this package's peer
 * range moved (thorwhalen/acture#57). `@rjsf/shadcn` is published on the 6.x
 * line only, so a consumer on a shadcn design system needs both halves to be
 * installable together, and needs a way to hand the theme to `<RjsfForm />`.
 *
 * Kept apart from `rjsf-form.test.tsx` on purpose: that file must stay runnable
 * against a plain 5.x tree (see the peer-range note below), and importing
 * `@rjsf/shadcn` would make it un-collectable there.
 */

/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
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
    expect(input).toBeTruthy();
    // shadcn's input template emits Tailwind utility classes; @rjsf/core's
    // emits the bare `form-control`.
    expect(input.className).not.toBe('form-control');
    expect(input.className).toContain('rounded-md');
  });

  it('submits through the theme', async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <RjsfForm command={cmd()} form={ShadcnForm} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
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
 * What they do NOT assert is that 5.x works. Only 6.x is installed here, and
 * only 6.x runs in CI. 5.x stays in the range because every API this adapter
 * touches is shape-identical across the two majors — `@rjsf/core`'s default
 * export and `FormProps`, `@rjsf/validator-ajv8`'s default export, and the
 * `schema` / `formData` / `validator` / `liveValidate` / `onSubmit` / children
 * props — and because `rjsf-form.test.tsx` was run by hand against a real 5.x
 * tree. It is not a claim CI re-checks. A single dev tree cannot hold both
 * majors: pnpm matches peers by package NAME, so an `npm:`-aliased 5.x install
 * silently binds the 6.x `@rjsf/utils` and the "5.x matrix" would be 6.x
 * wearing a 5.x label.
 */
describe('declared @rjsf peer range', () => {
  const pkg = readJson(resolve(process.cwd(), 'package.json')) as {
    peerDependencies: Record<string, string>;
  };
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
