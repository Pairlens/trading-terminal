// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Surface actions → AI SDK tools ───────────────────────────────────
//
// The whole agent loop runs in the terminal process, in the same React
// tree as the surfaces themselves, so a surface action can execute
// directly against the live closure the component registered. There is
// no forwarding step and no second dispatch table to keep in sync: the
// component that owns the state is the component that runs the tool.
//
// Actions marked `needsApproval` are handed to the model WITHOUT an
// `execute`. The AI SDK leaves those calls in `input-available`, the
// chat renders an approval card, and the card runs the action and
// reports back with `addToolResult`.

import { tool } from 'ai'
import type { ToolSet } from 'ai'

import type { AssistantSurfaceRegistry } from './surface-registry'

/** Tool names that stop the stream and wait for the user. */
export function collectApprovalToolNames(
  registry: AssistantSurfaceRegistry,
): Set<string> {
  const names = new Set<string>()
  for (const action of registry.getActions()) {
    if (action.needsApproval) names.add(action.name)
  }
  return names
}

/**
 * Snapshot the mounted surfaces into a tool set. Called once per turn,
 * so the model is always handed the screen as it stands right now.
 */
export function buildSurfaceTools(registry: AssistantSurfaceRegistry): ToolSet {
  const tools: ToolSet = {}

  for (const action of registry.getActions()) {
    if (action.needsApproval) {
      tools[action.name] = tool({
        description: action.description,
        inputSchema: action.inputSchema,
        // No execute: the call parks in `input-available` until the
        // user answers on a card.
      })
      continue
    }

    tools[action.name] = tool({
      description: action.description,
      inputSchema: action.inputSchema,
      execute: async (args) => runSurfaceAction(registry, action.name, args),
    })
  }

  return tools
}

/**
 * Run a published action by name, re-resolving it against the registry
 * so a card approved seconds later still lands on the surface the user
 * is looking at. Failures come back as a value, not a throw — a broken
 * action should let the model recover and explain, not kill the turn.
 */
export async function runSurfaceAction(
  registry: AssistantSurfaceRegistry,
  name: string,
  args: unknown,
): Promise<unknown> {
  const action = registry.getAction(name)
  if (!action) {
    return {
      error: `'${name}' is not available any more. The surface that offered it is no longer open.`,
    }
  }
  try {
    const result = await action.execute(args as never)
    return result ?? { ok: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
