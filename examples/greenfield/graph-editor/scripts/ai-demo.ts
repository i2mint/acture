#!/usr/bin/env node
/**
 * Vercel AI SDK demo for the graph-editor example. Sets up the registry
 * over an in-process zustand store, builds a tool map via
 * `acture-ai-vercel`, and asks an Anthropic model to compose a
 * multi-step graph mutation.
 *
 * Requires `ANTHROPIC_API_KEY` in the environment.
 *
 * Run via:
 *
 *     pnpm --filter acture-example-graph-editor ai-demo
 *
 * Expected behavior: the model issues 3 `app.graph.addNode` calls
 * (labels A, B, C) followed by 3 `app.selection.set` + `app.graph.connectNodes`
 * pairs to form a triangle. The final state is logged.
 */

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createRegistry } from 'acture';
import { createZustandAdapter } from 'acture-state-zustand';
import { toAITools } from 'acture-ai-vercel';
import { buildCommands } from '../src/commands/index.js';
import { initialGraphState, type GraphState } from '../src/state.js';

const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  process.stderr.write('Set ANTHROPIC_API_KEY in your environment.\n');
  process.exit(1);
}

const state = createZustandAdapter<GraphState>({ initialState: initialGraphState });
const registry = createRegistry();
registry.registerAll(buildCommands(state as unknown as Parameters<typeof buildCommands>[0]));

const anthropic = createAnthropic({ apiKey });

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: toAITools(registry),
  maxSteps: 12,
  prompt: [
    'You have a graph editor with the listed tools.',
    'Currently the graph already has nodes n1, n2, n3 and one edge.',
    'Add three new nodes labeled "A", "B", "C" (you choose coordinates),',
    'then connect them into a triangle (A→B, B→C, C→A).',
    'Use app.selection.set to pick the two endpoints before each connectNodes call.',
  ].join('\n'),
});

process.stdout.write(`Model said:\n${result.text}\n\n`);
process.stdout.write(`Final graph state:\n${JSON.stringify(state.getState(), null, 2)}\n`);
