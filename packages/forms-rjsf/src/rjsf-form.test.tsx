/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import { RjsfForm } from './rjsf-form.js';

afterEach(() => cleanup());

describe('<RjsfForm />', () => {
  it('renders a JSON-Schema-driven form from a CommandRecord', () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add a thing',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });
    const { container } = render(
      <RjsfForm command={cmd} onSubmit={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText('Add a thing')).toBeTruthy();
    expect(container.querySelector('form')).toBeTruthy();
  });

  it('submits the validated form data', async () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });
    const onSubmit = vi.fn();
    render(<RjsfForm command={cmd} onSubmit={onSubmit} onCancel={() => {}} />);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'A' } });
      fireEvent.submit(document.querySelector('form')!);
    });
    expect(onSubmit).toHaveBeenCalled();
    const arg = onSubmit.mock.calls[0]![0] as { label: string };
    expect(arg.label).toBe('A');
  });

  it('Esc fires onCancel', () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });
    const onCancel = vi.fn();
    const { container } = render(
      <RjsfForm command={cmd} onSubmit={() => {}} onCancel={onCancel} />,
    );
    fireEvent.keyDown(container.querySelector('[data-acture-rjsf]')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
