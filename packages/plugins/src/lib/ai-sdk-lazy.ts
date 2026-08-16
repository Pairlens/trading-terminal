// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Lazy handles on the AI SDK provider factories.
//
// The five bundled inference plugins are all statically imported by the
// terminal's bootstrap bundle, so anything they import at module level is in
// the boot graph. `@ai-sdk/anthropic` is 207 KB, `@ai-sdk/openai-compatible`
// 55 KB, `@ai-sdk/provider-utils` 64 KB, and zod comes along behind them at
// 293 KB. That was ~600 KB every visitor downloaded before deciding whether
// they wanted an AI provider at all.
//
// `initialize` is the wrong place to load them: `pairlens-intelligence` is the
// always-on fallback and initializes on every launch. `getLanguageModel` is
// the right place, because it is called exactly when someone runs the
// assistant. Hence the async `getLanguageModel` in the plugin contract.
//
// Same shape as the ccxt bridge's venue classes, which are deep dynamic
// imports for the same reason: shipped in the bundle, absent from the boot
// graph.

// `import type` and nothing else: it is erased before the bundler sees it, so
// naming these costs no edge in the module graph. A value import here would
// undo the whole file.
import type { createAnthropic } from '@ai-sdk/anthropic'
import type { createOpenAICompatible } from '@ai-sdk/openai-compatible'

type CreateOpenAiCompatible = typeof createOpenAICompatible
type CreateAnthropic = typeof createAnthropic

let openAiCompatible: Promise<CreateOpenAiCompatible> | null = null
let anthropic: Promise<CreateAnthropic> | null = null

/** Cached across calls and across plugins: four of the five share this one. */
export function loadOpenAiCompatible(): Promise<CreateOpenAiCompatible> {
  openAiCompatible ??= import('@ai-sdk/openai-compatible').then(
    (m) => m.createOpenAICompatible,
  )
  return openAiCompatible
}

export function loadAnthropic(): Promise<CreateAnthropic> {
  anthropic ??= import('@ai-sdk/anthropic').then((m) => m.createAnthropic)
  return anthropic
}
