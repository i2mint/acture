/// <reference lib="dom" />

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRegistry, defineCommand, ok } from 'acture';
import { Inspector } from './inspector.js';
import { instrumentRegistry } from './dispatch-log.js';

afterEach(() => {
  cleanup();
});

function setup() {
  const registry = createRegistry();
  registry.registerAll([
    defineCommand({
      id: 'app.search',
      title: 'Search',
      description: 'Search the corpus.',
      execute: () => ok('hits'),
    }),
    defineCommand({
      id: 'app.exp.thing',
      title: 'Exp',
      tier: 'experimental',
      execute: () => ok('x'),
    }),
  ]);
  return registry;
}

describe('<Inspector />', () => {
  it('renders command IDs in the commands view', () => {
    const registry = setup();
    render(<Inspector registry={registry} />);
    expect(screen.getByText('app.search')).toBeDefined();
    expect(screen.getByText('app.exp.thing')).toBeDefined();
  });

  it('renders tier badges', () => {
    const registry = setup();
    render(<Inspector registry={registry} />);
    // Two badge spans should be present — one per command.
    expect(screen.getAllByText(/stable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/experimental/i).length).toBeGreaterThan(0);
  });

  it('shows the dispatch-log tab when a log is provided', () => {
    const registry = setup();
    const log = instrumentRegistry(registry);
    render(<Inspector registry={registry} log={log} />);
    expect(screen.getByText(/Dispatch log/)).toBeDefined();
  });

  it('does NOT render the dispatch-log tab when no log is provided', () => {
    const registry = setup();
    render(<Inspector registry={registry} />);
    expect(screen.queryByText(/Dispatch log/)).toBeNull();
  });

  it('renders the when-evaluator tab', () => {
    const registry = setup();
    render(<Inspector registry={registry} />);
    fireEvent.click(screen.getByText(/When evaluator/));
    expect(screen.getByText(/when-clause \(DSL\)/)).toBeDefined();
    // Default expression evaluates to true against the default context.
    expect(screen.getByText(/Result: true/)).toBeDefined();
  });
});
