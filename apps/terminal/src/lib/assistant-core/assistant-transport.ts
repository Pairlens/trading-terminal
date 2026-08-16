// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The assistant's agentic loop ─────────────────────────────────────
//
// Runs entirely client-side, in the same process as the terminal. The
// resolved ai:inference plugin supplies a model and nothing else, which
// is what lets a tool reach straight into a mounted pane instead of
// round-tripping through a server that is not allowed to see any of it.
//
// Everything the model is given is read at send time, and the tool
// gating is re-read at every step: the user can navigate mid-run, and
// the assistant should notice.

import { convertToModelMessages, stepCountIs, streamText } from 'ai'

import { buildAssistantSystemPrompt } from './assistant-brain'
import {
  NOTIFICATION_GUIDE,
  SCRIPT_GUIDE_POINTER,
  WORKFLOW_GUIDE,
} from './guides'
import {
  buildScreenContextBlock,
  buildSurfaceActionBlock,
} from './screen-context'
import {
  CHART_ACTION_TOOL_NAMES,
  activeToolsFor,
  buildAssistantToolSet,
} from './tools'
import type { AssistantPersona } from './assistant-brain'
import type { AssistantDeps } from './tool-deps'
import type {
  ChatTransport,
  LanguageModel,
  UIMessage,
  UIMessageChunk,
} from 'ai'
import { SDK_GUIDE_CORE } from '@/lib/assistant/sdk-guide'
import { track } from '@/lib/analytics-events'

/**
 * Higher than the copilot's old 16. One turn now legitimately spans
 * "read the chart, pull two timeframes, write a script, validate it,
 * backtest, deploy" and cutting that off mid-way leaves the user with
 * half a thing.
 */
const MAX_STEPS = 28

const CHART_TOOLS = new Set<string>(CHART_ACTION_TOOL_NAMES)

export class AssistantTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly opts: {
      /** Read at send time so the tools see the terminal as it is now. */
      getDeps: () => AssistantDeps
      getPersona: () => AssistantPersona
    },
  ) {}

  sendMessages: ChatTransport<UIMessage>['sendMessages'] = async (options) => {
    const deps = this.opts.getDeps()
    const provider = deps.pluginManager.getPluginForCapability('ai:inference')
    if (!provider) {
      throw new Error(
        'No AI provider is enabled. Enable one on the Plugins page.',
      )
    }

    // Awaited: the bundled providers load their AI SDK on first use rather
    // than at boot, so the model arrives a promise the first time round.
    const model = await provider.getLanguageModel?.()
    if (!model) {
      // No silent text-only degradation. An assistant that can see the
      // terminal but cannot act in it would narrate work it never did,
      // which is worse than saying plainly that it needs a real model.
      throw new Error(
        'The active AI provider does not expose a model the assistant can drive tools with. Pick Pairlens Intelligence or a bring-your-own-key provider on the Plugins page.',
      )
    }

    const persona = this.opts.getPersona()
    track('assistant_message_sent', {
      provider: provider.manifest.id,
      persona,
      model:
        typeof model === 'object' && 'modelId' in model
          ? String((model as { modelId: unknown }).modelId)
          : String(model),
    })

    const tools = buildAssistantToolSet(deps)
    const toolNames = Object.keys(tools)

    const result = streamText({
      model: model as LanguageModel,
      system: buildAssistantSystemPrompt({
        persona,
        screen: buildScreenContextBlock(deps.registry),
        surfaceActions: buildSurfaceActionBlock(deps.registry),
        venues: deps
          .getMarketData()
          ?.availableMarkets.map((market) => market.marketId),
        guides: guidesFor(deps),
      }),
      messages: await convertToModelMessages(options.messages),
      tools,
      // Re-read per step: a navigation in step 2 should put the chart
      // tools back on the table for step 3.
      prepareStep: () => ({
        activeTools: activeToolsFor(
          this.opts.getDeps(),
          toolNames,
          CHART_TOOLS,
        ),
      }),
      stopWhen: stepCountIs(MAX_STEPS),
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
    }) as ReadableStream<UIMessageChunk>
  }

  reconnectToStream: ChatTransport<UIMessage>['reconnectToStream'] = async () =>
    null
}

/**
 * The automation guides are short and prevent an expensive failure, so
 * they always ride along. The Python SDK guide is twelve kilobytes: it
 * rides only when the workbench is open, and everywhere else the model
 * pulls what it needs through get_sdk_reference.
 */
function guidesFor(deps: AssistantDeps): Array<string> {
  const guides = [WORKFLOW_GUIDE, NOTIFICATION_GUIDE]
  guides.push(deps.getWorkbench() ? SDK_GUIDE_CORE : SCRIPT_GUIDE_POINTER)
  return guides
}
