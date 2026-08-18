// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Naming a conversation ────────────────────────────────────────────
//
// A sidebar of threads is only navigable if the rows say something. The
// first user message already does, so it names the thread the instant it
// is sent (see `titleFromText`); this asks the model for a better one in
// the background and swaps it in when it arrives.
//
// One short call, no tools, no streaming. It runs against the same
// ai:inference plugin the chat runs against, which means a bring-your-own
// -key user pays their own provider a handful of tokens for it and a
// signed-out user gets the fallback title and nothing else. It is never
// awaited on the path of a send.

import { generateText } from 'ai'

import type { LanguageModel } from 'ai'
import type { PluginManager } from '@pairlens/plugin-system'
import { normalizeTitle } from '@/stores/assistant-conversations-store'

/**
 * Short on purpose. A title is a label, not a summary, and a model given
 * room will write a sentence.
 */
const TITLE_PROMPT = [
  'You name chat threads in a trading terminal.',
  'Reply with a title of at most six words for the conversation that starts with the message below.',
  'Name the subject: the instrument, the task, the thing being built.',
  'No quotes, no trailing period, no preamble, no explanation. The title only.',
].join(' ')

/** Beyond this the model is reading an essay to write six words. */
const MAX_SEED_CHARS = 600

/** A title that never arrives must not hold a row hostage. */
const TIMEOUT_MS = 12_000

/**
 * Ask the active provider to name a thread. Resolves null on anything at
 * all going wrong: no provider, no model, a refusal, a timeout, an empty
 * answer. The caller already has a usable title and is only ever
 * upgrading it.
 */
export async function generateConversationTitle(
  pluginManager: PluginManager,
  firstMessage: string,
): Promise<string | null> {
  const seed = firstMessage.trim().slice(0, MAX_SEED_CHARS)
  if (!seed) return null

  try {
    const provider = pluginManager.getPluginForCapability('ai:inference')
    const model = await provider?.getLanguageModel?.('chat')
    if (!model) return null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const result = await generateText({
        model: model as LanguageModel,
        system: TITLE_PROMPT,
        prompt: seed,
        // Six words plus whatever preamble a small model insists on.
        maxOutputTokens: 32,
        temperature: 0.2,
        abortSignal: controller.signal,
      })
      return normalizeTitle(result.text)
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // Titling is a nicety. It never surfaces an error and never retries:
    // a provider that is down is already being reported by the chat.
    return null
  }
}
