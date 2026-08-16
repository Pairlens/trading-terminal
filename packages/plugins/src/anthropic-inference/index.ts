// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { loadAnthropic } from '../lib/ai-sdk-lazy'
import { streamAnthropic } from '../lib/inference-sse'
import type { InferenceMessage } from '@pairlens/shared/plugin-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const anthropicInferenceManifest: PluginManifest = {
  id: 'anthropic-inference',
  name: 'Anthropic Inference',
  version: '0.1.0',
  author: 'Pairlens',
  description: 'AI inference via Anthropic Claude API',
  homepage: 'https://anthropic.com',
  icon: 'https://anthropic.com/favicon.ico',
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
      label: 'Anthropic API Key',
      required: true,
    },
    model: {
      type: 'string',
      label: 'Model',
      required: false,
      default: 'claude-sonnet-4-6',
    },
  },
}

type ChatMessage = {
  role: 'user' | 'assistant'
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

export function createAnthropicInferencePlugin(
  manifest: PluginManifest,
): PluginInstance {
  let config: Record<string, unknown> = {}

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params

    if (capability !== 'ai:inference') {
      throw new Error(
        `anthropic-inference: unsupported capability '${capability}'`,
      )
    }

    const apiKey = String(config['apiKey'] ?? '')
    const model = String(
      config['model'] ??
        anthropicInferenceManifest.config['model']?.default ??
        'claude-sonnet-4-6',
    )
    const rawMessages = p['messages'] as Array<{
      role: string
      content: string
    }>
    const maxTokens =
      p['maxTokens'] !== undefined ? Number(p['maxTokens']) : 1024

    // Anthropic separates system prompt from messages
    const systemMessages = rawMessages.filter((m) => m.role === 'system')
    const conversationMessages = rawMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })) as Array<ChatMessage>

    const systemPrompt = systemMessages.map((m) => m.content).join('\n')

    try {
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: conversationMessages,
      }
      if (systemPrompt.length > 0) {
        body['system'] = systemPrompt
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          content: `Anthropic API error ${response.status}: ${text}`,
          model,
          usage: { promptTokens: 0, completionTokens: 0 },
        } satisfies InferenceResult
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>
        model: string
        usage: { input_tokens: number; output_tokens: number }
      }

      const textBlock = data.content.find((b) => b.type === 'text')
      const content = textBlock?.text ?? ''
      return {
        content,
        model: data.model,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        },
      } satisfies InferenceResult
    } catch (err) {
      return {
        content: `anthropic-inference error: ${err instanceof Error ? err.message : String(err)}`,
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
        `anthropic-inference: unsupported capability '${params.capability}'`,
      )
    }
    const p = params.params
    return streamAnthropic({
      apiKey: String(config['apiKey'] ?? ''),
      model: String(
        config['model'] ??
          anthropicInferenceManifest.config['model']?.default ??
          'claude-sonnet-4-6',
      ),
      messages: p['messages'] as Array<InferenceMessage>,
      maxTokens:
        p['maxTokens'] !== undefined ? Number(p['maxTokens']) : undefined,
      onEvent: callback,
    })
  }

  // AI SDK model for the host-run agentic loop (tools, multi-step). The
  // extra header opts into direct browser/webview access with a user key.
  async function getLanguageModel(): Promise<unknown> {
    const createAnthropic = await loadAnthropic()
    return createAnthropic({
      apiKey: String(config['apiKey'] ?? ''),
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    })(
      String(
        config['model'] ??
          anthropicInferenceManifest.config['model']?.default ??
          'claude-sonnet-4-6',
      ),
    )
  }

  async function initialize(cfg: Record<string, unknown>): Promise<void> {
    // Without a key every request fails — refuse to activate so a keyless
    // install never wins ai:inference resolution or grants the copilot gate
    if (String(cfg['apiKey'] ?? '').trim() === '') {
      throw new Error(
        'Anthropic API key required — add it in the plugin settings',
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
