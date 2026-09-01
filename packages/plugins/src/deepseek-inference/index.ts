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

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

export const deepseekInferenceManifest: PluginManifest = {
  id: 'deepseek-inference',
  name: 'DeepSeek Inference',
  version: '0.1.0',
  author: 'Pairlens',
  description: 'AI inference via DeepSeek API',
  homepage: 'https://www.deepseek.com',
  icon: '/posters/deepseek-inference.png',
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
      label: 'DeepSeek API Key',
      required: true,
    },
    model: {
      type: 'string',
      label: 'Model',
      required: false,
      default: DEFAULT_MODEL,
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

export function createDeepseekInferencePlugin(
  manifest: PluginManifest,
): PluginInstance {
  let config: Record<string, unknown> = {}

  function configuredModel(): string {
    return String(
      config['model'] ??
        deepseekInferenceManifest.config['model']?.default ??
        DEFAULT_MODEL,
    )
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params

    if (capability !== 'ai:inference') {
      throw new Error(
        `deepseek-inference: unsupported capability '${capability}'`,
      )
    }

    const apiKey = String(config['apiKey'] ?? '')
    const model = configuredModel()
    const messages = p['messages'] as Array<ChatMessage>
    const temperature =
      p['temperature'] !== undefined ? Number(p['temperature']) : 0.7
    const maxTokens =
      p['maxTokens'] !== undefined ? Number(p['maxTokens']) : 1024

    try {
      const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
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
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          content: `DeepSeek API error ${response.status}: ${text}`,
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
        content: `deepseek-inference error: ${err instanceof Error ? err.message : String(err)}`,
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
        `deepseek-inference: unsupported capability '${params.capability}'`,
      )
    }
    const p = params.params
    return streamOpenAiCompatible({
      url: `${DEEPSEEK_BASE_URL}/chat/completions`,
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

  // AI SDK model for the host-run agentic loop (tools, multi-step). Note:
  // api.deepseek.com does not send CORS headers, so direct browser calls only
  // work where CORS is not enforced (e.g. permissive webviews); the Tauri
  // desktop app is the supported home for this connector.
  async function getLanguageModel(): Promise<unknown> {
    const createOpenAICompatible = await loadOpenAiCompatible()
    return createOpenAICompatible({
      name: 'deepseek',
      baseURL: DEEPSEEK_BASE_URL,
      apiKey: String(config['apiKey'] ?? ''),
    }).chatModel(configuredModel())
  }

  async function initialize(cfg: Record<string, unknown>): Promise<void> {
    // Without a key every request fails — refuse to activate so a keyless
    // install never wins ai:inference resolution or grants the copilot gate
    if (String(cfg['apiKey'] ?? '').trim() === '') {
      throw new Error(
        'DeepSeek API key required: add it in the plugin settings',
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
