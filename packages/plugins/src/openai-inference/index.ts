// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { loadOpenAiCompatible } from '../lib/ai-sdk-lazy'
import { streamOpenAiCompatible } from '../lib/inference-sse'
import type { InferenceMessage } from '@pairlens/shared/plugin-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const openaiInferenceManifest: PluginManifest = {
  id: 'openai-inference',
  name: 'OpenAI Inference',
  version: '0.1.0',
  author: 'Pairlens',
  description: 'AI inference via OpenAI API',
  homepage: 'https://openai.com',
  icon: '/posters/openai-inference.png',
  metadata: { family: 'ai-byok' },
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
      label: 'OpenAI API Key',
      required: true,
    },
    model: {
      type: 'string',
      label: 'Model',
      required: false,
      default: 'gpt-4o-mini',
    },
  },
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type InferenceResult = {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

export function createOpenaiInferencePlugin(
  manifest: PluginManifest,
): PluginInstance {
  let config: Record<string, unknown> = {}

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params

    if (capability !== 'ai:inference') {
      throw new Error(
        `openai-inference: unsupported capability '${capability}'`,
      )
    }

    const apiKey = String(config['apiKey'] ?? '')
    const model = String(
      config['model'] ??
        openaiInferenceManifest.config['model']?.default ??
        'gpt-4o-mini',
    )
    const messages = p['messages'] as Array<ChatMessage>
    const temperature =
      p['temperature'] !== undefined ? Number(p['temperature']) : 0.7
    const maxTokens =
      p['maxTokens'] !== undefined ? Number(p['maxTokens']) : 1024

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
        },
      )

      if (!response.ok) {
        const text = await response.text()
        return {
          content: `OpenAI API error ${response.status}: ${text}`,
          model,
          usage: { promptTokens: 0, completionTokens: 0 },
        } satisfies InferenceResult
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        model: string
        usage: { prompt_tokens: number; completion_tokens: number }
      }

      const content = data.choices[0]?.message.content ?? ''
      return {
        content,
        model: data.model,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        },
      } satisfies InferenceResult
    } catch (err) {
      return {
        content: `openai-inference error: ${err instanceof Error ? err.message : String(err)}`,
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
        `openai-inference: unsupported capability '${params.capability}'`,
      )
    }
    const p = params.params
    return streamOpenAiCompatible({
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: String(config['apiKey'] ?? ''),
      model: String(
        config['model'] ??
          openaiInferenceManifest.config['model']?.default ??
          'gpt-4o-mini',
      ),
      messages: p['messages'] as Array<InferenceMessage>,
      temperature:
        p['temperature'] !== undefined ? Number(p['temperature']) : undefined,
      maxTokens:
        p['maxTokens'] !== undefined ? Number(p['maxTokens']) : undefined,
      onEvent: callback,
    })
  }

  // AI SDK model for the host-run agentic loop (tools, multi-step). Note:
  // api.openai.com does not send CORS headers, so direct browser calls only
  // work where CORS is not enforced (e.g. permissive webviews); the Tauri
  // desktop app is the supported home for this connector.
  async function getLanguageModel(): Promise<unknown> {
    const createOpenAICompatible = await loadOpenAiCompatible()
    return createOpenAICompatible({
      name: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: String(config['apiKey'] ?? ''),
    }).chatModel(
      String(
        config['model'] ??
          openaiInferenceManifest.config['model']?.default ??
          'gpt-4o-mini',
      ),
    )
  }

  async function initialize(cfg: Record<string, unknown>): Promise<void> {
    // Without a key every request fails — refuse to activate so a keyless
    // install never wins ai:inference resolution or grants the copilot gate
    if (String(cfg['apiKey'] ?? '').trim() === '') {
      throw new Error('OpenAI API key required: add it in the plugin settings')
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
