// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Chat transport for the builder assistant. Sibling of PluginChatTransport
 * (the copilot's): same ai:inference resolution, same client-side agentic
 * loop, but with the builder prompt and tool set injected instead of the
 * copilot's hardcoded ones.
 *
 * One deliberate difference: the copilot degrades to a text-only stream when
 * a third-party provider exposes no AI SDK model. The builder does not — a
 * chat that cannot call tools cannot edit scripts or create bots, and
 * pretending otherwise would have the model narrate work it never did. All
 * bundled providers (Pairlens Intelligence + every BYOK plugin) expose
 * getLanguageModel, so this only refuses exotic third-party providers.
 */
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import type { AssistantSurface } from './assistant-shared-tools'
import type { ChatTransport, LanguageModel, ToolSet, UIMessage } from 'ai'
import type { PluginManager } from '@pairlens/plugin-system'
import { track } from '@/lib/analytics-events'

export class AssistantChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly opts: {
      pluginManager: PluginManager
      surface: AssistantSurface
      /**
       * Both read at send time, so the snapshot the model sees is the page as
       * it is now. Which prompt and which tool set is the panel's call: the
       * builder surfaces write Python, the automation surfaces write graphs,
       * and this transport only runs the loop.
       */
      getSystemPrompt: () => string
      getTools: () => ToolSet
    },
  ) {}

  sendMessages: ChatTransport<UIMessage>['sendMessages'] = async (options) => {
    const provider =
      this.opts.pluginManager.getPluginForCapability('ai:inference')
    if (!provider) {
      throw new Error(
        'No AI provider is enabled. Enable one on the Plugins page.',
      )
    }
    const model = provider.getLanguageModel?.()
    if (!model) {
      throw new Error(
        'The active AI provider does not expose a model the assistant can drive tools with. Pick Pairlens Intelligence or a bring-your-own-key provider on the Plugins page.',
      )
    }

    track('assistant_message_sent', {
      provider: provider.manifest.id,
      surface: this.opts.surface,
      model:
        typeof model === 'object' && model !== null && 'modelId' in model
          ? String((model as { modelId: unknown }).modelId)
          : String(model),
    })

    const result = streamText({
      model: model as LanguageModel,
      system: this.opts.getSystemPrompt(),
      messages: await convertToModelMessages(options.messages),
      tools: this.opts.getTools(),
      // Higher than the copilot's 16: a write → traceback → fix → validate →
      // backtest loop burns steps fast, and cutting it off mid-repair leaves
      // the user with a broken draft.
      stopWhen: stepCountIs(24),
      onStepFinish: (step) => {
        for (const call of step.toolCalls) {
          track('assistant_tool_used', { tool: call.toolName })
        }
      },
      abortSignal: options.abortSignal,
    })
    return result.toUIMessageStream({
      onError: (error) =>
        error instanceof Error ? error.message : String(error),
    })
  }

  reconnectToStream: ChatTransport<UIMessage>['reconnectToStream'] = async () =>
    null
}
