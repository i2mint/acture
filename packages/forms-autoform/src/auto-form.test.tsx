/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { defineCommand, ok } from 'acture';
import { AutoForm } from './auto-form.js';

afterEach(() => cleanup());

describe('<AutoForm />', () => {
  it('renders one input per schema field', () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({
        label: z.string(),
        count: z.number(),
      }),
      execute: (p) => ok(p),
    });
    const { container } = render(
      <AutoForm command={cmd} onSubmit={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelectorAll('[data-acture-autoform-field]').length).toBe(2);
  });

  it('submits validated params on click', async () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string().min(1), count: z.number() }),
      execute: (p) => ok(p),
    });
    const onSubmit = vi.fn();
    render(<AutoForm command={cmd} onSubmit={onSubmit} onCancel={() => {}} />);

    const inputs = document.querySelectorAll('input');
    const labelInput = inputs[0]!;
    const countInput = inputs[1]!;
    await act(async () => {
      fireEvent.change(labelInput, { target: { value: 'A' } });
      fireEvent.change(countInput, { target: { value: '7' } });
      fireEvent.click(screen.getByText('Run'));
    });
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]![0]).toEqual({ label: 'A', count: 7 });
  });

  it('surfaces per-field validation errors before submit', async () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string().min(2, 'too short') }),
      execute: (p) => ok(p),
    });
    const onSubmit = vi.fn();
    render(<AutoForm command={cmd} onSubmit={onSubmit} onCancel={() => {}} />);
    const input = document.querySelector('input')!;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'X' } });
      fireEvent.click(screen.getByText('Run'));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('too short')).toBeTruthy();
  });

  it('renders a <select> for enum fields', () => {
    const cmd = defineCommand({
      id: 'app.t.set',
      title: 'Set',
      params: z.object({ tier: z.enum(['low', 'mid', 'high']) }),
      execute: (p) => ok(p),
    });
    render(<AutoForm command={cmd} onSubmit={() => {}} onCancel={() => {}} />);
    expect(document.querySelector('select')).toBeTruthy();
  });

  it('Esc fires onCancel', () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });
    const onCancel = vi.fn();
    render(<AutoForm command={cmd} onSubmit={() => {}} onCancel={onCancel} />);
    const form = document.querySelector('form')!;
    fireEvent.keyDown(form, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Cmd+Enter submits', async () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });
    const onSubmit = vi.fn();
    render(<AutoForm command={cmd} onSubmit={onSubmit} onCancel={() => {}} />);
    const form = document.querySelector('form')!;
    const input = document.querySelector('input')!;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Z' } });
      fireEvent.keyDown(form, { key: 'Enter', metaKey: true });
    });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('seeds with defaults prop', () => {
    const cmd = defineCommand({
      id: 'app.t.add',
      title: 'Add',
      params: z.object({ label: z.string() }),
      execute: (p) => ok(p),
    });
    render(
      <AutoForm
        command={cmd}
        defaults={{ label: 'seeded' }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('seeded');
  });
});
