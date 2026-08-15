// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Is the run actually over? ────────────────────────────────────────
//
// `status === 'ready'` is not the same as "finished". A run parked on an
// approval card or an `ask_user` question also reads as ready: the model's
// turn ended, and it is waiting for a person.
//
// That distinction is load-bearing for the composer queue. Flushing a
// queued message into a parked run appends a user turn while a tool call
// is still open, and a conversation with a dangling call cannot be
// continued at all — the next request is rejected by the provider and the
// only way out is clearing the thread.

import type { UIMessage } from 'ai'
import { asToolPart } from '@/components/copilot/tool-part'

/**
 * True when the last assistant message still has a tool call waiting for a
 * result. `input-available` means the arguments are complete and nothing
 * has answered it, which is exactly the parked window.
 */
export function hasParkedToolCall(messages: Array<UIMessage>): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return false
  return last.parts.some(
    (part) => asToolPart(part)?.state === 'input-available',
  )
}
