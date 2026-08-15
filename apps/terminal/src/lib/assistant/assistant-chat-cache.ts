// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Session-scoped memory for the builder assistant's conversations, plus the
 * one-shot intents that steer it from outside the panel.
 *
 * The panel unmounts whenever the user closes it or navigates away; losing
 * the thread each time would make an iterative build (write → look at the
 * chart → ask for a tweak) start over constantly. A module-level map keeps
 * the messages for the lifetime of the window — deliberately NOT persisted:
 * the conversation references script ids and tool outputs that go stale
 * across sessions, and unlike the copilot there is no cloud history domain
 * for builder chats yet.
 *
 * Intents are the second half: an empty-state composer, a "Build with AI"
 * menu item, or the other surface's assistant handing work over all need to
 * say something to a chat they don't own — one that may not even be mounted
 * yet, on a page the user is still navigating to. They leave the request
 * here; the panel picks it up the moment it is live.
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

// ---------------------------------------------------------------------------
// Intents — what someone else wants this surface's assistant to do
// ---------------------------------------------------------------------------

export type AssistantIntent = {
  /** Send as the user's next message as soon as the chat is live. */
  prompt?: string
  /** Put the cursor in the composer, without saying anything for them. */
  focus?: boolean
}

const intents = new Map<AssistantSurface, AssistantIntent>()
const listeners = new Set<() => void>()

/**
 * Queue work for a surface's assistant. Merges into anything still pending,
 * so a "focus the composer" and a handed-over prompt can't cancel each other.
 */
export function requestAssistant(
  surface: AssistantSurface,
  intent: AssistantIntent,
): void {
  intents.set(surface, { ...intents.get(surface), ...intent })
  // Copy first: a listener that consumes the intent may unsubscribe.
  for (const listener of [...listeners]) listener()
}

export function hasAssistantIntent(surface: AssistantSurface): boolean {
  return intents.has(surface)
}

/** Read and clear. Consuming once is what keeps a remount from re-sending. */
export function consumeAssistantIntent(
  surface: AssistantSurface,
): AssistantIntent | null {
  const intent = intents.get(surface) ?? null
  intents.delete(surface)
  return intent
}

export function subscribeAssistantIntents(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
