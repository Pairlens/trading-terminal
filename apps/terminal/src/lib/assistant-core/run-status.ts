// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── What the orb says while it works ─────────────────────────────────
//
// The companion line beside the orb is the only progress signal a user
// gets once the chat window is minimized, so it reports what the run is
// actually doing rather than a generic spinner word.

import type { UIMessage } from 'ai'
import { asToolPart } from '@/components/copilot/tool-part'

export type AssistantRunPhase = 'idle' | 'thinking' | 'tool' | 'search'

export type AssistantRunStatus = {
  phase: AssistantRunPhase
  /** The tool in flight, for a more specific line than "Using tools". */
  toolName: string | null
}

const IDLE: AssistantRunStatus = { phase: 'idle', toolName: null }

/** Tools whose honest description is "looking things up on the web". */
const SEARCH_TOOLS = new Set(['web_search', 'deep_research', 'get_news'])

/** A tool call that has been requested but has not produced a result. */
const IN_FLIGHT_STATES = new Set(['input-streaming', 'input-available'])

export function deriveRunStatus(
  messages: Array<UIMessage>,
  status: string,
): AssistantRunStatus {
  if (status !== 'streaming' && status !== 'submitted') return IDLE

  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') {
    return { phase: 'thinking', toolName: null }
  }

  // Walk backwards: the most recent in-flight call is the one the user
  // is waiting on.
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const tool = asToolPart(last.parts[i])
    if (!tool || !tool.state || !IN_FLIGHT_STATES.has(tool.state)) continue
    return {
      phase: SEARCH_TOOLS.has(tool.toolName) ? 'search' : 'tool',
      toolName: tool.toolName,
    }
  }

  return { phase: 'thinking', toolName: null }
}
