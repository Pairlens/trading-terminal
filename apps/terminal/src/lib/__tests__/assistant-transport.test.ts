// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { AssistantChatTransport } from '../assistant/assistant-transport'
import { buildAssistantTools } from '../assistant/assistant-tools'
import { buildAssistantSystemPrompt } from '../assistant/assistant-brain'
import type { AssistantPromptContext } from '../assistant/assistant-brain'
import type { UIMessage, UIMessageChunk } from 'ai'
import type { PluginInstance, PluginManager } from '@pairlens/plugin-system'

type SendOptions = Parameters<AssistantChatTransport['sendMessages']>[0]

function fakeManager(provider: PluginInstance | null): PluginManager {
  return {
    getPluginForCapability: () => provider,
  } as unknown as PluginManager
}

function promptContext(): AssistantPromptContext {
  return {
    surface: 'indicators',
    selectedScript: {
      id: 's1',
      name: 'My Strategy',
      kind: 'strategy',
      metaError: null,
      files: [{ path: 'main.py', source: 'meta = strategy(...)' }],
    },
    scriptCount: 1,
    strategyCount: 1,
    bots: [],
    venues: ['okx'],
    previewTarget: {
      market: 'okx',
      pair: 'BTC-USDT',
      timeframe: '1h',
      bars: 500,
    },
  }
}

function makeTransport(provider: PluginInstance | null) {
  return new AssistantChatTransport({
    pluginManager: fakeManager(provider),
    surface: 'indicators',
    getSystemPrompt: () => buildAssistantSystemPrompt(promptContext()),
    getTools: () =>
      buildAssistantTools({
        surface: 'indicators',
        getWorkbench: () => null,
        getMarketData: () => null,
        getPython: () => ({
          registerScript: async () => {
            throw new Error('not needed in this test')
          },
          compute: async () => ({ outputs: {} }),
        }),
        navigate: () => {},
      }),
  })
}

function userMessage(text: string): UIMessage {
  return { id: 'u1', role: 'user', parts: [{ type: 'text', text }] }
}

function sendOptions(messages: Array<UIMessage>): SendOptions {
  return {
    trigger: 'submit-message',
    chatId: 'chat-1',
    messageId: undefined,
    messages,
    abortSignal: undefined,
  } as SendOptions
}

async function readAll(
  stream: ReadableStream<UIMessageChunk>,
): Promise<Array<UIMessageChunk>> {
  const reader = stream.getReader()
  const chunks: Array<UIMessageChunk> = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

describe('AssistantChatTransport', () => {
  test('runs the builder loop with the builder prompt and tool set', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Building' },
            { type: 'text-end', id: 't1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            },
          ],
        }),
      }),
    })
    const provider: PluginInstance = {
      manifest: { id: 'pairlens-intelligence' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: () => model,
    }

    const chunks = await readAll(
      await makeTransport(provider).sendMessages(
        sendOptions([userMessage('build me an RSI strategy')]),
      ),
    )
    const types = chunks.map((c) => c.type)
    expect(types).toContain('text-delta')
    expect(types[types.length - 1]).toBe('finish')

    const call = model.doStreamCalls[0]
    const toolNames = (call.tools ?? []).map((t) => t.name)
    for (const name of [
      'list_scripts',
      'get_script',
      'create_script',
      'update_script',
      'delete_file',
      'validate_script',
      'run_backtest',
      'get_sdk_reference',
      'list_venues',
      'set_preview_target',
      'list_bots',
      'get_bot',
      'create_bot',
      'update_bot',
      'ask_user',
      'handoff_to_builder',
    ]) {
      expect(toolNames).toContain(name)
    }

    const system = String(call.prompt.find((m) => m.role === 'system')?.content)
    expect(system).toContain('builder assistant')
    // The SDK contract and the open script both ride in the prompt
    expect(system).toContain('indicator(...)')
    expect(system).toContain('meta = strategy(...)')
    expect(system).toContain('My Strategy')
    // Arming is out of bounds by prompt as well as by tool schema
    expect(system).toContain('paper')
    // The preview depth reaches the model, so it can judge whether a backtest
    // has enough history behind it
    expect(system).toContain('500 bars')
  })

  test('throws when no provider resolves ai:inference', () => {
    expect(
      makeTransport(null).sendMessages(sendOptions([userMessage('hi')])),
    ).rejects.toThrow('No AI provider')
  })

  test('refuses providers without an AI SDK model instead of degrading', () => {
    const provider: PluginInstance = {
      manifest: { id: 'third-party-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => ({ content: 'text only' }),
    }
    expect(
      makeTransport(provider).sendMessages(sendOptions([userMessage('hi')])),
    ).rejects.toThrow('does not expose a model')
  })
})
