// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The builder assistant — a chat that writes indicators, strategies and bots
 * with the user. Hosted as a side rail by the script workbench (where it can
 * drive the open editor) and by the bots page.
 *
 * Same architecture as the copilot panel: the whole agentic loop is
 * client-side, the resolved `ai:inference` plugin only supplies the model,
 * and every tool executes in the transport against the same stores the UI
 * renders from. The message list reuses the copilot's message component —
 * builder tool calls render as the same status chips.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Eraser, Loader2, Sparkles, X } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { parseBillingErrorCode } from '@pairlens/shared/billing-types'
import { AssistantQuestionCard, readQuestion } from './assistant-question-card'
import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'
import type { NormalizedToolPart } from '@/components/copilot/tool-part'
import type { AssistantQuestionOption } from './assistant-question-card'
import type {
  AssistantSurface,
  AssistantWorkbenchBridge,
} from '@/lib/assistant/assistant-tools'
import { AssistantChatTransport } from '@/lib/assistant/assistant-transport'
import {
  buildAssistantTools,
  collectAssistantPromptContext,
} from '@/lib/assistant/assistant-tools'
import {
  clearCachedAssistantMessages,
  consumeAssistantIntent,
  getCachedAssistantMessages,
  setCachedAssistantMessages,
  subscribeAssistantIntents,
} from '@/lib/assistant/assistant-chat-cache'
import { ASSISTANT_TOOL_LABELS } from '@/lib/assistant/assistant-tool-labels'
import { asToolPart } from '@/components/copilot/tool-part'
import { getPythonRuntime } from '@/lib/python/python-runtime'
import { useMarketData } from '@/lib/market-data-provider'
import { usePairlens } from '@/lib/pairlens-provider'
import { track } from '@/lib/analytics-events'
import { useCapabilityAccess } from '@/hooks/use-capability-access'
import { useStickToBottom } from '@/hooks/use-stick-to-bottom'
import { AuthRequiredPrompt } from '@/components/capability-gate'
import { ConnectAiProviderButton } from '@/components/ai-provider-connect'
import {
  BillingErrorNotice,
  IntelligenceUpgradePrompt,
} from '@/components/billing/intelligence-upsell'
import { CopilotChatMessage } from '@/components/copilot/copilot-chat-message'
import { CopilotInput } from '@/components/copilot/copilot-input'

type AssistantPanelProps = {
  surface: AssistantSurface
  /** Editor bridge, only when the workbench hosts the panel. */
  workbench?: AssistantWorkbenchBridge | null
  onClose: () => void
}

export function AssistantPanel(props: AssistantPanelProps) {
  const { t } = useTranslation()
  const access = useCapabilityAccess('ai:inference')

  if (access.status === 'auth-required') {
    return (
      <AuthRequiredPrompt
        title={t('assistant.authRequiredTitle')}
        description={t('assistant.authRequiredDescription')}
        primaryNote={t('capabilityGate.intelligenceNote')}
        alternative={<ConnectAiProviderButton />}
      />
    )
  }

  if (access.status === 'upgrade-required') {
    return (
      <IntelligenceUpgradePrompt
        description={t('assistant.upgradeRequiredDescription')}
        alternative={<ConnectAiProviderButton />}
      />
    )
  }

  if (access.status !== 'granted') {
    return (
      <div className="flex min-h-0 h-full flex-1 flex-col items-center justify-center p-6">
        <Empty className="max-w-xs">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t('assistant.unavailableTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('assistant.unavailableDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <ConnectAiProviderButton />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link to="/plugins" />}
            >
              <Brain className="size-3.5" />
              {t('copilot.goToPlugins')}
            </Button>
          </div>
        </Empty>
      </div>
    )
  }

  return <AssistantChatInner {...props} />
}

function AssistantChatInner({
  surface,
  workbench = null,
  onClose,
}: AssistantPanelProps) {
  const { t } = useTranslation()
  const { pluginManager } = usePairlens()
  const marketData = useMarketData()
  const navigate = useNavigate()

  // Refs so the transport's send-time getters always see the freshest
  // handles without the chat re-rendering when they change.
  const marketDataRef = useRef(marketData)
  marketDataRef.current = marketData
  const workbenchRef = useRef(workbench)
  workbenchRef.current = workbench
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const deps = useMemo(
    () => ({
      surface,
      getWorkbench: () => workbenchRef.current,
      getMarketData: () => marketDataRef.current,
      getPython: () => getPythonRuntime(),
      // The handoff: the other page's assistant already has the message
      // (queued through the intent cache), this just takes the user there.
      // The toast is what stops the navigation reading as a misclick.
      navigate: ({
        to,
        scriptId,
      }: {
        to: AssistantSurface
        scriptId?: string
      }) => {
        toast(
          to === 'indicators'
            ? t('assistant.handoffToIndicators')
            : t('assistant.handoffToBots'),
        )
        void navigateRef.current(
          to === 'indicators'
            ? {
                to: '/indicators',
                search: scriptId ? { script: scriptId } : {},
              }
            : { to: '/bots', search: {} },
        )
      },
    }),
    [surface, t],
  )

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        pluginManager,
        surface,
        getPromptContext: () => collectAssistantPromptContext(deps),
        getTools: () => buildAssistantTools(deps),
      }),
    [pluginManager, surface, deps],
  )

  // Per-run analytics: tool-call count + latency, never content.
  const runStartRef = useRef(0)
  const runToolCallsRef = useRef(0)

  const {
    messages,
    status,
    sendMessage,
    setMessages,
    stop,
    error,
    addToolResult,
  } = useChat({
    id: `assistant:${surface}`,
    messages: getCachedAssistantMessages(surface),
    transport,
    // ask_user has no execute: the run pauses on the question and resumes by
    // itself the moment this message carries an answer for every tool call.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: () => {
      runToolCallsRef.current += 1
    },
    onFinish: () => {
      track('assistant_run_completed', {
        outcome: 'success',
        tool_calls: runToolCallsRef.current,
        duration_ms: runStartRef.current ? Date.now() - runStartRef.current : 0,
      })
    },
  })

  // Survive unmount (tab switches, closing the rail) for this window's life.
  useEffect(() => {
    setCachedAssistantMessages(surface, messages)
  }, [surface, messages])

  // A run that surfaced an error never reaches onFinish — record it once.
  const trackedErrorRef = useRef<unknown>(null)
  useEffect(() => {
    if (!error || trackedErrorRef.current === error) return
    trackedErrorRef.current = error
    track('assistant_run_completed', {
      outcome: 'error',
      tool_calls: runToolCallsRef.current,
      duration_ms: runStartRef.current ? Date.now() - runStartRef.current : 0,
    })
  }, [error])

  // The question the assistant is waiting on, if any. Only the newest one can
  // be open: the run stops on the call, so nothing else is in flight.
  const pendingQuestion = useMemo(
    () => findPendingQuestion(messages),
    [messages],
  )

  const answerQuestion = useCallback(
    (toolCallId: string, answer: string) => {
      addToolResult({
        tool: 'ask_user',
        toolCallId,
        output: { answer },
      } as Parameters<typeof addToolResult>[0])
    },
    [addToolResult],
  )

  const handleSend = useCallback(
    (text: string) => {
      // A typed message while a question is open answers the question. Sending
      // it as a fresh turn instead would leave the tool call unanswered, and a
      // conversation with a dangling call cannot be continued at all.
      if (pendingQuestion) {
        answerQuestion(pendingQuestion.toolCallId, text)
        return
      }
      runStartRef.current = Date.now()
      runToolCallsRef.current = 0
      sendMessage({ text })
    },
    [sendMessage, pendingQuestion, answerQuestion],
  )

  // Requests queued from outside the panel: the empty-state composer, the
  // "Build with AI" menu items, and a handoff from the other surface.
  const [focusSignal, setFocusSignal] = useState(0)
  const handleSendRef = useRef(handleSend)
  handleSendRef.current = handleSend
  useEffect(() => {
    const apply = () => {
      const intent = consumeAssistantIntent(surface)
      if (!intent) return
      if (intent.focus) setFocusSignal((n) => n + 1)
      if (intent.prompt) handleSendRef.current(intent.prompt)
    }
    apply()
    return subscribeAssistantIntents(apply)
  }, [surface])

  const handleClear = useCallback(() => {
    setMessages([])
    clearCachedAssistantMessages(surface)
  }, [setMessages, surface])

  const renderToolPart = useCallback(
    (tool: NormalizedToolPart) => {
      if (tool.toolName !== 'ask_user' || !tool.toolCallId) return null
      const { question, options } = readQuestion(tool.input)
      if (!question) return null
      const answered = tool.output?.answer
      const toolCallId = tool.toolCallId
      return (
        <AssistantQuestionCard
          question={question}
          options={options}
          answer={typeof answered === 'string' ? answered : null}
          onAnswer={(answer) => answerQuestion(toolCallId, answer)}
        />
      )
    },
    [answerQuestion],
  )

  const quickActions = useMemo(
    () =>
      surface === 'indicators'
        ? [
            t('assistant.quickNewIndicator'),
            t('assistant.quickNewStrategy'),
            t('assistant.quickImprove'),
          ]
        : [
            t('assistant.quickBotFromScratch'),
            t('assistant.quickCreateBot'),
            t('assistant.quickGuards'),
            t('assistant.quickReview'),
          ],
    [surface, t],
  )

  const billingErrorCode = parseBillingErrorCode(error?.message)

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="magic-gradient pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px]" />

      {/* Header */}
      <div className="border-border/60 flex items-center gap-2 border-b px-3 py-1.5">
        <Sparkles className="size-3.5" style={{ color: 'var(--magic-1)' }} />
        <span className="text-xs font-medium">{t('assistant.title')}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {messages.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={handleClear}
                    aria-label={t('assistant.clearChat')}
                  />
                }
              >
                <Eraser className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{t('assistant.clearChat')}</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onClose}
            aria-label={t('assistant.close')}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AssistantMessages
          messages={messages}
          status={status}
          renderToolPart={renderToolPart}
          emptyHint={
            surface === 'indicators'
              ? t('assistant.emptyHintIndicators')
              : t('assistant.emptyHintBots')
          }
        />
        {error ? (
          <div className="px-3 pb-1">
            {billingErrorCode ? (
              <BillingErrorNotice code={billingErrorCode} />
            ) : (
              <p className="text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                {t('assistant.genericError')}
              </p>
            )}
          </div>
        ) : null}
        <CopilotInput
          onSend={handleSend}
          status={status}
          onStop={stop}
          quickActions={pendingQuestion ? [] : quickActions}
          placeholder={
            pendingQuestion
              ? t('assistant.answerPlaceholder')
              : t('assistant.placeholder')
          }
          focusSignal={focusSignal}
        />
      </div>
    </div>
  )
}

/** The open `ask_user` call, if the run is parked on one. */
type PendingQuestion = {
  toolCallId: string
  question: string
  options: Array<AssistantQuestionOption>
}

function findPendingQuestion(
  messages: Array<UIMessage>,
): PendingQuestion | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  for (const part of last.parts) {
    const tool = asToolPart(part)
    if (!tool || tool.toolName !== 'ask_user') continue
    // `input-available` means the arguments are complete and no result has
    // been added yet — exactly the window where the user's answer is owed.
    if (tool.state !== 'input-available' || !tool.toolCallId) continue
    const { question, options } = readQuestion(tool.input)
    if (!question) continue
    return { toolCallId: tool.toolCallId, question, options }
  }
  return null
}

function AssistantMessages({
  messages,
  status,
  emptyHint,
  renderToolPart,
}: {
  messages: Array<UIMessage>
  status: string
  emptyHint: string
  renderToolPart: (tool: NormalizedToolPart) => ReactNode | null
}) {
  const { t } = useTranslation()
  const isStreaming = status === 'streaming' || status === 'submitted'
  const { contentRef, scrollToBottom } = useStickToBottom({
    enabled: isStreaming,
  })
  const prevLenRef = useRef(0)

  useEffect(() => {
    if (messages.length !== prevLenRef.current) {
      prevLenRef.current = messages.length
      scrollToBottom('auto')
    }
  }, [messages.length, scrollToBottom])

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AiOrb size="48px" animationDuration={25} />
        <div className="max-w-[220px] space-y-1.5">
          <p className="font-serif text-base font-medium leading-snug">
            {t('assistant.emptyTitle')}
          </p>
          <p className="text-muted-foreground text-xs">{emptyHint}</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div ref={contentRef} className="space-y-2 p-2">
        {messages.map((msg) => (
          <CopilotChatMessage
            key={msg.id}
            message={msg}
            toolLabels={ASSISTANT_TOOL_LABELS}
            renderToolPart={renderToolPart}
          />
        ))}
        {status === 'streaming' && (
          <div className="flex items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="size-3 animate-spin" />
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
