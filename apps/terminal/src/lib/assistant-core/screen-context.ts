// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── "What the user is looking at" ────────────────────────────────────
//
// Every mounted surface describes itself; this folds those descriptions
// into the block the assistant reads at the top of each turn. Ordering
// is the registry's ranking, so the surface the user is working in is
// the first thing the model sees.

import type { AssistantSurfaceRegistry } from './surface-registry'

/** Keeps a runaway surface from crowding out the conversation. */
const MAX_DETAIL_CHARS = 1200
const MAX_SURFACES = 8

function renderDetail(detail: Record<string, unknown>): string | null {
  let json: string
  try {
    json = JSON.stringify(detail)
  } catch {
    return null
  }
  if (json === '{}') return null
  return json.length > MAX_DETAIL_CHARS
    ? `${json.slice(0, MAX_DETAIL_CHARS)}… (truncated)`
    : json
}

/**
 * The screen block for the system prompt. Returns null when nothing is
 * mounted that has anything to say, so the prompt can omit the section
 * entirely rather than assert an empty screen.
 */
export function buildScreenContextBlock(
  registry: AssistantSurfaceRegistry,
): string | null {
  const contexts = registry.getContexts().slice(0, MAX_SURFACES)
  if (contexts.length === 0) return null

  const lines: Array<string> = []
  for (const context of contexts) {
    const detail = context.detail ? renderDetail(context.detail) : null
    lines.push(
      detail ? `- ${context.summary}\n  ${detail}` : `- ${context.summary}`,
    )
  }

  return [
    'What the user is looking at right now (most relevant first):',
    ...lines,
  ].join('\n')
}

/**
 * The action catalogue for the system prompt. The model already gets
 * the tool schemas; this tells it which of them belong to the screen,
 * which is what stops it asking the user to navigate somewhere it can
 * simply act.
 */
export function buildSurfaceActionBlock(
  registry: AssistantSurfaceRegistry,
): string | null {
  const actions = registry.getActions()
  if (actions.length === 0) return null
  return [
    'Actions the current screen is offering (call them directly, do not ask the user to do it by hand):',
    actions.map((action) => action.name).join(', '),
  ].join('\n')
}
