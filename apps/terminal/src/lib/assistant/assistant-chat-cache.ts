// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Session-scoped memory for the builder assistant's conversations.
 *
 * The panel unmounts whenever the user closes it or navigates away; losing
 * the thread each time would make an iterative build (write → look at the
 * chart → ask for a tweak) start over constantly. A module-level map keeps
 * the messages for the lifetime of the window — deliberately NOT persisted:
 * the conversation references script ids and tool outputs that go stale
 * across sessions, and unlike the copilot there is no cloud history domain
 * for builder chats yet.
 */
import type { UIMessage } from 'ai'
import type { AssistantSurface } from './assistant-tools'

const cache = new Map<AssistantSurface, Array<UIMessage>>()

export function getCachedAssistantMessages(
  surface: AssistantSurface,
): Array<UIMessage> {
  return cache.get(surface) ?? []
}

export function setCachedAssistantMessages(
  surface: AssistantSurface,
  messages: Array<UIMessage>,
): void {
  cache.set(surface, messages)
}

export function clearCachedAssistantMessages(surface: AssistantSurface): void {
  cache.delete(surface)
}
