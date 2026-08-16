// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The one conversation ─────────────────────────────────────────────
//
// Mounted once per window: inside the desktop dock, or as the mobile
// Co-pilot tab. Never both, because the viewport gate is exclusive and
// two mounts would mean two runs answering the same user.
//
// It stays mounted while the dock is collapsed, which is what lets a
// long run keep working while the user goes back to the chart.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import {
  ArrowDown,
  ArrowUpRight,
  Brain,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { parseBillingErrorCode } from '@pairlens/shared/billing-types'

import {
  AssistantResearchCard,
  readResearchOutput,
} from './assistant-research-card'
import { AssistantApprovalCard } from './assistant-approval-card'
import type { UIMessage } from 'ai'
import type { AssistantRunStatus } from '@/lib/assistant-core/run-status'
import type { AssistantPersona } from '@/lib/assistant-core/assistant-brain'
import type {
  CopilotCancelRequest,
  CopilotOrderActions,
  CopilotOrderRequest,
} from '@/components/copilot/copilot-order-card'
import i18n from '@/lib/i18n'
import { api, queryKeys } from '@/lib/api'
import { track } from '@/lib/analytics-events'
import { useCapabilityAccess } from '@/hooks/use-capability-access'
import { useStickToBottom } from '@/hooks/use-stick-to-bottom'
import { useMarketData } from '@/lib/market-data-provider'
import { useMarketRefWithPreferred } from '@/lib/market-ref/use-market-ref'
import { credentialMarketFor } from '@/lib/venues/credential-alias'
import { useCredentialsStore } from '@/stores/credentials-store'
import {
  isVaultEnrolled,
  isVaultUnlocked,
} from '@/lib/security/vault/vault-session'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { AuthRequiredPrompt } from '@/components/capability-gate'
import {
  BillingErrorNotice,
  IntelligenceUpgradePrompt,
} from '@/components/billing/intelligence-upsell'
import { ConnectAiProviderButton } from '@/components/ai-provider-connect'
import { CopilotChatMessage } from '@/components/copilot/copilot-chat-message'
import { CopilotInput } from '@/components/copilot/copilot-input'
import { asToolPart } from '@/components/copilot/tool-part'
import { CopilotOrderActionsProvider } from '@/components/copilot/copilot-order-card'
import {
  AssistantQuestionCard,
  readQuestion,
} from '@/components/assistant/assistant-question-card'

import { AssistantTransport } from '@/lib/assistant-core/assistant-transport'
import { useAssistantDeps } from '@/lib/assistant-core/assistant-provider'
import { executeClientTool } from '@/lib/assistant-core/client-tools'
import { ASSISTANT_ALL_TOOL_LABELS } from '@/lib/assistant-core/tool-labels'
import { humanizeToolName } from '@/lib/copilot/tool-labels'
import { runSurfaceAction } from '@/lib/assistant-core/surface-tools'
import { deriveRunStatus } from '@/lib/assistant-core/run-status'
import { hasParkedToolCall } from '@/lib/assistant-core/run-gate'
import {
  clearScreenshots,
  getScreenshot,
} from '@/lib/assistant-core/screenshot-store'
import { useAssistantStore } from '@/stores/assistant-store'

/**
 * The assistant's history is not scoped to a pair any more, so it rides
 * the existing per-pair endpoint under one fixed key. One conversation,
 * one thread, regardless of where the user has been.
 */
const HISTORY_MARKET = 'assistant'
const HISTORY_KEY = 'global'

const MAX_SCHEDULED_CHECKS = 8

/** Actions the surrounding chrome drives, published once on mount. */
export type AssistantConversationHandle = {
  clear: () => void
  hasMessages: boolean
}

export type AssistantConversationProps = {
  /** Reports run phase up to the orb. Only called when the phase moves. */
  onStatusChange?: (status: AssistantRunStatus) => void
  /**
   * Owned by the chrome, because the control that changes it lives in
   * the window header. Falls back to the stored preference so the
   * mobile tab, which has no header, still gets the user's choice.
   */
  persona?: AssistantPersona
  /**
   * Filled in with the conversation's controls so the window header can
   * offer a clear button without the chat owning a second header row.
   */
  controlsRef?: React.RefObject<AssistantConversationHandle | null>
}

export function AssistantConversation(props: AssistantConversationProps) {
  const { t } = useTranslation()
  const access = useCapabilityAccess('ai:inference')

  const historyQuery = useQuery({
    queryKey: queryKeys.aiMessages(HISTORY_MARKET, HISTORY_KEY),
    queryFn: () => api.getAiMessages(HISTORY_MARKET, HISTORY_KEY),
    enabled: access.status === 'granted',
  })

  if (access.status === 'auth-required') {
    return (
      <AuthRequiredPrompt
        title={t('assistantDock.authRequiredTitle')}
        description={t('assistantDock.authRequiredDescription')}
        primaryNote={t('capabilityGate.intelligenceNote')}
        alternative={<ConnectAiProviderButton />}
      />
    )
  }

  if (access.status === 'upgrade-required') {
    return (
      <IntelligenceUpgradePrompt
        description={t('assistantDock.upgradeRequiredDescription')}
        alternative={<ConnectAiProviderButton />}
      />
    )
  }

  if (access.status !== 'granted') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <Empty className="max-w-xs">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Brain className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t('assistantDock.unavailableTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('assistantDock.unavailableDescription')}
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
              {t('assistantDock.goToPlugins')}
            </Button>
          </div>
        </Empty>
      </div>
    )
  }

  if (historyQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  return (
    <AssistantConversationInner
      {...props}
      initialMessages={(historyQuery.data ?? []) as Array<UIMessage>}
    />
  )
}

function AssistantConversationInner({
  onStatusChange,
  controlsRef,
  persona: personaProp,
  initialMessages,
}: AssistantConversationProps & { initialMessages: Array<UIMessage> }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const resolveMarketRef = useMarketRefWithPreferred()
  const marketData = useMarketData()
  const marketDataRef = useRef(marketData)
  marketDataRef.current = marketData

  const [storedPersona] = usePersistedState<AssistantPersona>(
    'copilot.persona',
    'balanced',
  )
  const personaRef = useRef(personaProp ?? storedPersona)
  personaRef.current = personaProp ?? storedPersona

  // schedule_check timers. The dock outlives navigation, so unlike the
  // old pane-bound copilot a scheduled follow-up actually survives the
  // user walking to another page.
  const handleSendRef = useRef<(text: string) => void>(() => {})
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])
  const scheduleCheck = useCallback((minutes: number, instruction: string) => {
    if (timersRef.current.size >= MAX_SCHEDULED_CHECKS) return
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      handleSendRef.current(
        `${i18n.t('copilot.scheduledCheckPrefix', { minutes })} ${instruction}`,
      )
    }, minutes * 60_000)
    timersRef.current.add(timer)
  }, [])

  const deps = useAssistantDeps({ scheduleCheck })
  const depsRef = useRef(deps)
  depsRef.current = deps

  const transport = useMemo(
    () =>
      new AssistantTransport({
        getDeps: () => depsRef.current,
        getPersona: () => personaRef.current,
      }),
    [],
  )

  const runStartRef = useRef(0)
  const runToolCallsRef = useRef(0)

  const {
    messages,
    status,
    sendMessage,
    setMessages,
    stop,
    error,
    regenerate,
    addToolResult,
  } = useChat({
    id: 'pairlens-assistant',
    messages: initialMessages,
    transport,
    // ask_user and approval-gated surface actions have no execute: the
    // run parks on them and resumes by itself once every call in the
    // last message carries a result.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      runToolCallsRef.current += 1
      executeClientTool(
        toolCall.toolName,
        toolCall.input as Record<string, unknown> | undefined,
        {
          chart: depsRef.current.getChart(),
          navigate,
          resolveMarketRef,
          scheduleCheck,
          toolCallId: toolCall.toolCallId,
        },
      )
    },
    onFinish: ({ message }) => {
      track('assistant_run_completed', {
        outcome: 'success',
        tool_calls: runToolCallsRef.current,
        duration_ms: runStartRef.current ? Date.now() - runStartRef.current : 0,
      })
      api.saveAiMessage(HISTORY_MARKET, HISTORY_KEY, message).catch(() => {
        // Persistence is best-effort; the conversation is still live.
      })
    },
  })

  // ── Run status, reported up to the orb ────────────────────────────
  const runStatus = deriveRunStatus(messages, status)
  const lastReportedRef = useRef<string>('')
  useEffect(() => {
    const key = `${runStatus.phase}:${runStatus.toolName ?? ''}`
    if (lastReportedRef.current === key) return
    lastReportedRef.current = key
    onStatusChange?.(runStatus)
  }, [runStatus, onStatusChange])

  // ── Sending ───────────────────────────────────────────────────────
  const pendingQuestion = findPendingQuestion(messages)

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

  const send = useCallback(
    (text: string) => {
      runStartRef.current = Date.now()
      runToolCallsRef.current = 0
      sendMessage({ text })
      api
        .saveAiMessage(HISTORY_MARKET, HISTORY_KEY, {
          role: 'user' as const,
          parts: [{ type: 'text' as const, text }],
        })
        .catch(() => {
          // Best-effort.
        })
    },
    [sendMessage],
  )

  // One message may wait for the run in flight. A turn can span 28 steps
  // and minutes of wall-clock, and the composer used to be dead for all of
  // it, so a correction that occurred to the user halfway through was
  // simply lost. A backlog is deliberately not supported: the second
  // queued message would be answered with context from before an answer
  // the user has not read yet.
  const [queued, setQueued] = useState<string | null>(null)

  const handleSend = useCallback(
    (text: string) => {
      // A typed message while a question is open answers it. Sending a
      // fresh turn instead would leave the tool call dangling, and a
      // conversation with a dangling call cannot be continued at all.
      if (pendingQuestion) {
        answerQuestion(pendingQuestion.toolCallId, text)
        return
      }
      if (status !== 'ready') {
        track('assistant_message_queued')
        setQueued(text)
        return
      }
      send(text)
    },
    [send, status, pendingQuestion, answerQuestion],
  )
  handleSendRef.current = handleSend

  // Flush when the run is genuinely over, not merely idle. A parked
  // approval or question also reads as `ready`, and sending there would
  // strand the tool call the run is waiting on.
  const parked = pendingQuestion !== null || hasParkedToolCall(messages)
  useEffect(() => {
    if (queued === null || status !== 'ready' || parked) return
    setQueued(null)
    send(queued)
  }, [queued, status, parked, send])

  // A surface asked the assistant something. Consumed once. A seed that
  // does not send lands in the composer instead, so a "Build with AI"
  // button can open the chat with the request already typed.
  const seed = useAssistantStore((state) => state.seed)
  const consumeSeed = useAssistantStore((state) => state.consumeSeed)
  const [composerSeed, setComposerSeed] = useState<{
    text: string
    signal: number
  }>({ text: '', signal: 0 })
  useEffect(() => {
    if (!seed) return
    const taken = consumeSeed()
    if (!taken || !taken.prompt.trim()) return
    if (taken.send) {
      handleSend(taken.prompt)
      return
    }
    setComposerSeed((previous) => ({
      text: taken.prompt,
      signal: previous.signal + 1,
    }))
  }, [seed, consumeSeed, handleSend])

  const handleRegenerate = useCallback(() => {
    track('assistant_regenerated', { after_error: Boolean(error) })
    runStartRef.current = Date.now()
    runToolCallsRef.current = 0
    regenerate()
  }, [regenerate, error])

  const handleClear = useCallback(() => {
    api.clearAiMessages(HISTORY_MARKET, HISTORY_KEY).catch(() => {
      // Best-effort.
    })
    clearScreenshots()
    setMessages([])
    queryClient.invalidateQueries({
      queryKey: queryKeys.aiMessages(HISTORY_MARKET, HISTORY_KEY),
    })
  }, [setMessages, queryClient])

  // Published after commit, not during render: a render React throws
  // away must not be the one the window header ends up holding.
  const hasMessages = messages.length > 0
  useEffect(() => {
    if (!controlsRef) return
    controlsRef.current = { clear: handleClear, hasMessages }
    return () => {
      controlsRef.current = null
    }
  }, [controlsRef, handleClear, hasMessages])

  // ── Order execution for the confirm cards ─────────────────────────
  const orderActions = useMemo<CopilotOrderActions>(
    () => ({
      tradingMode: 'paper',
      placeOrder: async (req: CopilotOrderRequest, mode) => {
        const md = marketDataRef.current
        if (!md)
          return { success: false, error: i18n.t('copilot.tradingUnavailable') }
        // Sealed vault is checked BEFORE the credential lookup: the store
        // is empty because it could not read, not because nothing is
        // stored, and "add API keys" would be exactly the wrong advice.
        if (isVaultEnrolled() && !isVaultUnlocked()) {
          return {
            success: false,
            error: i18n.t('security.vault.orderBlocked'),
          }
        }
        const cred = useCredentialsStore
          .getState()
          .getCredentialForMarket(credentialMarketFor(req.market))
        if (mode === 'live' && !cred) {
          return {
            success: false,
            error: i18n.t('copilot.noCredentialsForMarket', {
              market: req.market,
            }),
          }
        }
        const params: Record<string, unknown> = {
          market: req.market,
          pair: req.pair,
          side: req.side,
          type: req.type,
          size: String(req.size),
          mode,
          analyticsSource: 'copilot',
        }
        if (cred) params.credentialId = cred.id
        if (req.type === 'limit' && req.price != null) {
          params.price = String(req.price)
        }
        try {
          const result = await md.placeOrder(params)
          return {
            success: result.success,
            orderId: result.orderId,
            error: result.error,
          }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
      cancelOrder: async (req: CopilotCancelRequest) => {
        const md = marketDataRef.current
        if (!md)
          return { success: false, error: i18n.t('copilot.tradingUnavailable') }
        const cred = useCredentialsStore
          .getState()
          .getCredentialForMarket(credentialMarketFor(req.market))
        try {
          const result = await md.cancelOrder(
            req.market,
            req.orderId,
            req.pair,
            cred?.id,
          )
          return { success: result.success, error: result.error }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),
    [],
  )

  // The assistant's own UI vocabulary. A tool that has something better
  // to show than a status chip claims its own renderer here; everything
  // else falls through to the chip, and a tool nobody has taught the UI
  // about still renders.
  const renderToolPart = useCallback(
    (tool: ReturnType<typeof asToolPart>) => {
      if (!tool) return null

      if (tool.toolName === 'ask_user' && tool.toolCallId) {
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
      }

      // The chart PNG the engine handed back during the call. Kept out of
      // the tool result on purpose (see screenshot-store.ts), so this is
      // the only place it can appear.
      if (tool.toolName === 'take_screenshot') {
        const dataUrl = getScreenshot(tool.toolCallId)
        if (dataUrl) {
          return (
            <img
              src={dataUrl}
              alt={t('copilot.chartScreenshot')}
              className="max-h-72 w-auto max-w-full rounded-xl"
            />
          )
        }
      }

      if (tool.toolName === 'deep_research') {
        const research = readResearchOutput(tool.output)
        if (research) return <AssistantResearchCard {...research} />
      }

      // A surface action marked needsApproval is declared without an
      // execute, so the run is parked right here waiting for an answer.
      const gated = depsRef.current.registry.getAction(tool.toolName)
      if (gated?.needsApproval && tool.toolCallId) {
        const toolCallId = tool.toolCallId
        const output = tool.output as
          | { approved?: boolean; declined?: boolean }
          | undefined
        return (
          <AssistantApprovalCard
            title={humanizeToolName(tool.toolName)}
            description={gated.description}
            args={tool.input}
            outcome={output?.declined ? 'declined' : output ? 'approved' : null}
            onApprove={async () => {
              const result = await runSurfaceAction(
                depsRef.current.registry,
                tool.toolName,
                tool.input,
              )
              addToolResult({
                tool: tool.toolName,
                toolCallId,
                output: { approved: true, result },
              } as Parameters<typeof addToolResult>[0])
            }}
            onDecline={() =>
              addToolResult({
                tool: tool.toolName,
                toolCallId,
                output: {
                  declined: true,
                  reason: 'The user declined this action.',
                },
              } as Parameters<typeof addToolResult>[0])
            }
          />
        )
      }

      return null
    },
    [answerQuestion, addToolResult, t],
  )

  // Starter chips follow the screen: on a chart they name the pair, on a
  // builder page they name what that page makes.
  const chart = deps.getChart()
  const quickActions = useMemo(() => {
    if (chart) {
      const symbol = chart.pair.split('-')[0]
      return [
        t('assistantDock.quickAnalyze', { pair: chart.pair.replace('-', '/') }),
        t('assistantDock.quickLevels', { symbol }),
        t('assistantDock.quickAlert', { symbol }),
      ]
    }
    return [
      t('assistantDock.quickWhatsMoving'),
      t('assistantDock.quickPortfolio'),
      t('assistantDock.quickBuildAlert'),
    ]
  }, [chart, t])

  const billingErrorCode = parseBillingErrorCode(error?.message)
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

  return (
    <CopilotOrderActionsProvider value={orderActions}>
      <AssistantMessageList
        messages={messages}
        status={status}
        renderToolPart={renderToolPart}
        // The starters live on the empty screen, not above the composer:
        // they were only ever shown on an empty thread anyway, and there
        // they are an invitation rather than another strip of chrome.
        quickActions={quickActions}
        onQuickAction={handleSend}
        starterContext={chart ? 'chart' : 'global'}
        queued={queued}
        onRegenerate={status === 'ready' ? handleRegenerate : undefined}
      />
      {error ? (
        <div className="shrink-0 px-3 pb-1">
          {billingErrorCode ? (
            <BillingErrorNotice code={billingErrorCode} />
          ) : (
            // A failed run used to be a dead end: the prompt was gone and
            // the only way forward was to type it again.
            <div className="text-destructive border-destructive/30 bg-destructive/5 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
              <span className="min-w-0 flex-1">
                {t('assistantDock.genericError')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-6 shrink-0 gap-1 rounded-full px-2 text-[11px]"
                onClick={handleRegenerate}
              >
                <RefreshCw className="size-3" />
                {t('copilot.retry')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
      <CopilotInput
        onSend={handleSend}
        status={status}
        onStop={stop}
        queued={queued !== null}
        seedText={composerSeed.text}
        seedSignal={composerSeed.signal}
        placeholder={
          pendingQuestion
            ? t('assistantDock.answerPlaceholder')
            : t('assistantDock.placeholder')
        }
      />
    </CopilotOrderActionsProvider>
  )
}

// ── Message list ─────────────────────────────────────────────────────

function AssistantMessageList({
  messages,
  status,
  renderToolPart,
  quickActions,
  onQuickAction,
  starterContext,
  queued,
  onRegenerate,
}: {
  messages: Array<UIMessage>
  status: string
  renderToolPart: (tool: ReturnType<typeof asToolPart>) => React.ReactNode
  quickActions: Array<string>
  onQuickAction: (text: string) => void
  starterContext: 'chart' | 'global'
  /** Text waiting for the current run to finish, shown as a pending turn. */
  queued: string | null
  onRegenerate?: () => void
}) {
  const { t } = useTranslation()
  const isStreaming = status === 'streaming' || status === 'submitted'
  const { contentRef, scrollToBottom, isPinned, hasUnseen } = useStickToBottom({
    enabled: isStreaming,
  })
  const lastId = messages[messages.length - 1]?.id

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-6 text-center">
        <AiOrb size="46px" animationDuration={22} state="idle" />
        <div>
          <p className="font-serif text-[15px] font-medium">
            {t('assistantDock.emptyTitle')}
          </p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-[34ch] text-xs leading-relaxed">
            {t('assistantDock.emptyDescription')}
          </p>
        </div>
        {/* The starters name what THIS screen can do — a pair on a chart, a
            workflow on the workflows page. Full-width rows rather than the
            old scrolling chips: three readable sentences beat six truncated
            ones, and nothing here has to be dragged into view. */}
        <div className="flex w-full max-w-[320px] flex-col gap-1.5">
          {quickActions.map((action, position) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                // Position and context only. The text names the pair on a
                // chart, and a per-user record of which instruments someone
                // asks about is not what this measures.
                track('assistant_starter_used', {
                  position,
                  context: starterContext,
                })
                onQuickAction(action)
              }}
              className="ai-tile group/starter flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs"
            >
              <Sparkles
                className="size-3 shrink-0"
                style={{ color: 'var(--magic-1)' }}
              />
              <span className="min-w-0 flex-1 truncate">{action}</span>
              <ArrowUpRight className="text-muted-foreground size-3 shrink-0 opacity-0 transition-opacity group-hover/starter:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    // `relative` so the jump-to-latest button can hang over the scroller
    // without a second wrapper in the flex chain.
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="ai-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* The ref belongs on THIS element, the one that grows, not on the
            scroller above it. The hook walks up from here to find the
            scroller and watches this box for height changes, so putting it
            one level up breaks the follow silently: the observer ends up on
            a flex-sized box that never changes height. */}
        <div className="flex flex-col gap-3.5 px-3.5 py-3" ref={contentRef}>
          {messages.map((message) => (
            <CopilotChatMessage
              key={message.id}
              message={message}
              toolLabels={ASSISTANT_ALL_TOOL_LABELS}
              renderToolPart={renderToolPart}
              // Only the newest answer can be regenerated. Rewriting an
              // older one would throw away every turn after it.
              onRegenerate={
                message.id === lastId && message.role === 'assistant'
                  ? onRegenerate
                  : undefined
              }
            />
          ))}
          {queued !== null ? <QueuedTurn text={queued} /> : null}
          {isStreaming ? <TypingIndicator /> : null}
        </div>
      </div>

      {/* Scrolling up during a long run parks the view, which is the point.
          The pill is what stops that from costing you the answer, and it
          says which of the two situations you are in: the thread simply
          moved on without you, or something new is waiting down there. The
          second reads louder because it is the one worth interrupting for. */}
      {!isPinned && messages.length > 0 ? (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          data-unseen={hasUnseen ? '' : undefined}
          className="ai-glass-pill text-muted-foreground hover:text-foreground data-unseen:text-foreground absolute inset-x-0 bottom-2 mx-auto flex h-7 w-fit items-center gap-1.5 rounded-full px-3 text-[11px]"
        >
          {hasUnseen ? (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: 'var(--magic-1)' }}
            />
          ) : (
            <ArrowDown className="size-3" />
          )}
          {hasUnseen ? t('copilot.newMessages') : t('copilot.jumpToLatest')}
        </button>
      ) : null}
    </div>
  )
}

/**
 * A message the user wrote while the assistant was still working. It is a
 * real turn that has not left yet, so it looks like one and says plainly
 * that it is waiting.
 */
function QueuedTurn({ text }: { text: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="ai-bubble-user text-foreground min-w-0 max-w-[86%] rounded-2xl rounded-br-md px-3 py-2 text-[13px] break-words opacity-60">
        <p className="leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
      <p className="text-muted-foreground flex items-center gap-1 text-[10px]">
        <Clock className="size-2.5" />
        {t('copilot.queued')}
      </p>
    </div>
  )
}

/** Three drifting dots in the AI colour: the thread's own "still working". */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-0.5 py-1" aria-hidden>
      {[0, 220, 440].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-pulse rounded-full"
          style={{
            background: 'var(--magic-1)',
            animationDelay: `${delay}ms`,
            animationDuration: '1.4s',
          }}
        />
      ))}
    </div>
  )
}

// ── Pending question ─────────────────────────────────────────────────

type PendingQuestion = { toolCallId: string; question: string }

function findPendingQuestion(
  messages: Array<UIMessage>,
): PendingQuestion | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  for (const part of last.parts) {
    const tool = asToolPart(part)
    if (!tool || tool.toolName !== 'ask_user') continue
    // `input-available` means the arguments are complete and no result
    // has been added yet: exactly the window where an answer is owed.
    if (tool.state !== 'input-available' || !tool.toolCallId) continue
    const { question } = readQuestion(tool.input)
    if (!question) continue
    return { toolCallId: tool.toolCallId, question }
  }
  return null
}
