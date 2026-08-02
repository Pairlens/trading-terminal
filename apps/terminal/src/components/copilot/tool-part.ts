// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { UIMessage } from 'ai'

export type NormalizedToolPart = {
  toolName: string
  state: string | undefined
  output: Record<string, unknown> | undefined
  errorText: string | undefined
}

/**
 * The AI SDK emits typed `tool-<name>` parts for statically-defined tools and
 * `dynamic-tool` parts for dynamic ones. The copilot's tools are static, so
 * their parts arrive as `tool-<name>` (e.g. `tool-get_market_snapshot`) — an
 * older `part.type === 'dynamic-tool'` check never matched them, so tool chips
 * and order-confirmation cards silently disappeared and only stray whitespace
 * text bubbles were left behind. Normalize both shapes to one.
 *
 * `output` is only surfaced once the tool has actually produced a result
 * (`state === 'output-available'`), matching how the order cards read it.
 */
export function asToolPart(
  part: UIMessage['parts'][number],
): NormalizedToolPart | null {
  const isDynamic = part.type === 'dynamic-tool'
  const isTyped = part.type.startsWith('tool-')
  if (!isDynamic && !isTyped) return null
  const p = part as {
    type: string
    toolName?: string
    state?: string
    output?: unknown
    errorText?: string
  }
  const toolName = isDynamic ? (p.toolName ?? '') : p.type.slice('tool-'.length)
  const output =
    p.state === 'output-available'
      ? (p.output as Record<string, unknown> | undefined)
      : undefined
  return { toolName, state: p.state, output, errorText: p.errorText }
}
