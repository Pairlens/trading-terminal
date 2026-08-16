// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import {
  anthropicInferenceManifest,
  createAnthropicInferencePlugin,
} from '../anthropic-inference'
import {
  createGroqInferencePlugin,
  groqInferenceManifest,
} from '../groq-inference'
import {
  createOpenaiInferencePlugin,
  openaiInferenceManifest,
} from '../openai-inference'
import {
  createOpenrouterInferencePlugin,
  openrouterInferenceManifest,
} from '../openrouter-inference'

// The bundled inference plugins are all statically imported by the terminal's
// bootstrap bundle, so an AI SDK imported at their module level lands in the
// boot graph: ~600 KB (two @ai-sdk packages plus zod) downloaded by every
// visitor before deciding whether they wanted AI at all. The SDKs are loaded
// inside `getLanguageModel` instead, which is why it is async.
//
// This pins the contract from the host's side. The lazy-load itself is
// invisible to a unit test, but "returns a thenable" is the part a future
// refactor could quietly break by making the function synchronous again --
// and it would break silently, because `await` on a plain value works and the
// bundle regression only shows up in a build.

const PROVIDERS = [
  {
    name: 'anthropic',
    create: createAnthropicInferencePlugin,
    manifest: anthropicInferenceManifest,
  },
  {
    name: 'groq',
    create: createGroqInferencePlugin,
    manifest: groqInferenceManifest,
  },
  {
    name: 'openai',
    create: createOpenaiInferencePlugin,
    manifest: openaiInferenceManifest,
  },
  {
    name: 'openrouter',
    create: createOpenrouterInferencePlugin,
    manifest: openrouterInferenceManifest,
  },
]

describe('bundled inference plugins load their AI SDK lazily', () => {
  for (const { name, create, manifest } of PROVIDERS) {
    test(`${name}: getLanguageModel is async and resolves to a model`, async () => {
      const plugin = create(manifest)
      await plugin.initialize?.({ apiKey: 'test-key-not-used' })

      const pending = plugin.getLanguageModel?.()
      expect(pending).toBeInstanceOf(Promise)

      const model = await pending
      // The AI SDK's LanguageModel carries these two; asserting on them
      // rather than on a class keeps this independent of the SDK version.
      expect(model).toBeTruthy()
      expect(typeof (model as { modelId?: unknown }).modelId).toBe('string')
    })
  }
})
