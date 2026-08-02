// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamOpenAiCompatible } from '../lib/inference-sse'
import type { InferenceMessage } from '@pairlens/shared/plugin-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

// OpenRouter — BYOK ai:inference provider. One key, hundreds of models
// (OpenAI, Anthropic, Google, Meta, Mistral, …) behind an OpenAI-compatible
// API. openrouter.ai sends CORS headers, so it works from the browser and
// the Tauri webview alike. Serves both the copilot chat and research report
// generation (the host runs the same loop against whatever model this
// plugin supplies).

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'openrouter/auto'

export const openrouterInferenceManifest: PluginManifest = {
  id: 'openrouter-inference',
  name: 'OpenRouter',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'AI inference via OpenRouter — one API key for hundreds of models across providers (bring your own key)',
  homepage: 'https://openrouter.ai',
  icon: 'https://openrouter.ai/favicon.ico',
  capabilities: [
    {
      id: 'ai:inference',
      singleton: false,
      markets: ['*'],
      priority: 10,
      streaming: false,
    },
  ],
  config: {
    apiKey: {
      type: 'secret',
      label: 'OpenRouter API Key',
      required: true,
    },
    model: {
      type: 'string',
      label: 'Model (any OpenRouter model id, e.g. anthropic/claude-sonnet-4)',
      required: false,
      default: DEFAULT_MODEL,
    },
  },
}

type InferenceResult = {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

export function createOpenrouterInferencePlugin(
  manifest: PluginManifest,
): PluginInstance {
  let config: Record<string, unknown> = {}

  function configuredModel(): string {
    const model = String(config['model'] ?? '').trim()
    return model || DEFAULT_MODEL
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params

    if (capability !== 'ai:inference') {
      throw new Error(
        `openrouter-inference: unsupported capability '${capability}'`,
      )
    }

    const model = configuredModel()
    const messages = p['messages'] as Array<InferenceMessage>
    const temperature =
      p['temperature'] !== undefined ? Number(p['temperature']) : 0.7
    const maxTokens =
      p['maxTokens'] !== undefined ? Number(p['maxTokens']) : 1024

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${String(config['apiKey'] ?? '')}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          content: `OpenRouter API error ${response.status}: ${text}`,
          model,
          usage: { promptTokens: 0, completionTokens: 0 },
        } satisfies InferenceResult
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        model: string
        usage?: { prompt_tokens: number; completion_tokens: number }
      }

      return {
        content: data.choices[0]?.message.content ?? '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
      } satisfies InferenceResult
    } catch (err) {
      return {
        content: `openrouter-inference error: ${err instanceof Error ? err.message : String(err)}`,
        model,
        usage: { promptTokens: 0, completionTokens: 0 },
      } satisfies InferenceResult
    }
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    if (params.capability !== 'ai:inference') {
      throw new Error(
        `openrouter-inference: unsupported capability '${params.capability}'`,
      )
    }
    const p = params.params
    return streamOpenAiCompatible({
      url: `${OPENROUTER_BASE_URL}/chat/completions`,
      apiKey: String(config['apiKey'] ?? ''),
      model: configuredModel(),
      messages: p['messages'] as Array<InferenceMessage>,
      temperature:
        p['temperature'] !== undefined ? Number(p['temperature']) : undefined,
      maxTokens:
        p['maxTokens'] !== undefined ? Number(p['maxTokens']) : undefined,
      onEvent: callback,
    })
  }

  // AI SDK model for the host-run agentic loop (copilot tools + research).
  // The user-selected model serves both purposes.
  function getLanguageModel(): unknown {
    return createOpenAICompatible({
      name: 'openrouter',
      baseURL: OPENROUTER_BASE_URL,
      apiKey: String(config['apiKey'] ?? ''),
    }).chatModel(configuredModel())
  }

  async function initialize(cfg: Record<string, unknown>): Promise<void> {
    // Without a key every request fails — refuse to activate so a keyless
    // install never wins ai:inference resolution or grants the copilot gate
    if (String(cfg['apiKey'] ?? '').trim() === '') {
      throw new Error(
        'OpenRouter API key required — add it in the plugin settings',
      )
    }
    config = cfg
  }

  return {
    manifest,
    status: 'installed',
    config,
    execute,
    subscribe,
    getLanguageModel,
    initialize,
  }
}
