// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The conversation ─────────────────────────────────────────────────
//
// Mounted once per window: inside the desktop dock, or as the mobile
// Assistant tab. Never both, because the viewport gate is exclusive and
// two mounts would mean two runs answering the same user.
//
// It stays mounted while the dock is collapsed, which is what lets a
// long run keep working while the user goes back to the chart.
//
// It shows ONE thread at a time out of however many the user has, and
// the thread it shows is the store's `activeId`. The chat is keyed on
// that id, so switching rebuilds the AI SDK's Chat around the other
// thread's messages rather than replaying them into the live one. What
// makes that safe is the switch effect below: the outgoing run is
// stopped and written out BEFORE the id the chat is keyed on moves.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import {
  ArrowDown,
  ArrowUpRight,
  Brain,
  Clock,
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
import { generateConversationTitle } from '@/lib/assistant-core/conversation-title'
import {
  ensureActiveConversation,
  titleFromText,
  useAssistantConversationsStore,
} from '@/stores/assistant-conversations-store'

const MAX_SCHEDULED_CHECKS = 8

/** Stable identity for an unread thread, so the chat is not rebuilt for it. */
const EMPTY_THREAD: Array<UIMessage> = []

/**
 * How long after the last change a thread is written to storage. Long
 * enough that a streaming answer is not serialized per token, short
 * enough that a window closed mid-answer keeps almost all of it.
 */
const PERSIST_DEBOUNCE_MS = 700

export type AssistantConversationProps = {
  /** Reports run phase up to the orb. Only called when the phase moves. */
  onStatusChange?: (status: AssistantRunStatus) => void
  /**
   * Owned by the chrome, because the control that changes it lives in
   * the window header. Falls back to the stored preference so the
   * mobile tab, which has no header, still gets the user's choice.
   */
  persona?: AssistantPersona
}

export function AssistantConversation(props: AssistantConversationProps) {
  const { t } = useTranslation()
  const access = useCapabilityAccess('ai:inference')

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

  return <AssistantConversationHost {...props} />
}

/**
 * Resolves which thread is on screen and hands it down as a plain prop.
 *
 * Split out so the store is only read once the assistant is actually
 * usable, and so the chat below can key itself on an id it is simply
 * given. The ensure runs in a layout effect rather than during render:
 * creating the first conversation is a store write, and a store write
 * mid-render is a write the conversation rail is also subscribed to.
 * Before paint, so the empty frame is never shown.
 *
 * It watches `activeId` rather than running once, because there are two
 * ways to have no thread and only one of them is the first launch. The
 * other is deleting the last one, which used to leave a blank column
 * behind until a reload; now it lands you in a fresh conversation, which
 * is what deleting the only thread means.
 */
function AssistantConversationHost(props: AssistantConversationProps) {
  const activeId = useAssistantConversationsStore((state) => state.activeId)
  useLayoutEffect(() => {
    if (!activeId) ensureActiveConversation()
  }, [activeId])

  if (!activeId) return <div className="min-h-0 flex-1" />

  return <AssistantConversationInner {...props} conversationId={activeId} />
}

function AssistantConversationInner({
  onStatusChange,
  persona: personaProp,
  conversationId,
}: AssistantConversationProps & { conversationId: string }) {
  const { t } = useTranslation()
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

  // ── Which thread is on screen ─────────────────────────────────────
  //
  // The chat is keyed on `threadId`, NOT on the store's `activeId`
  // directly. The two are the same except for the one render between a
  // row being clicked and the switch effect below having stopped and
  // written out the run that was in flight. Keying straight off the
  // store would rebuild the Chat first and orphan that run: it would
  // keep streaming into an object nothing renders, and the half answer
  // it had already produced would never be written anywhere.
  const [threadId, setThreadId] = useState(conversationId)
  // Read through the store's own cache rather than `messagesOf`, which
  // writes on a miss: `select` and `create` both load the thread before
  // they publish the id, so by the time it reaches here it is cached.
  // Unsubscribed on purpose. `useChat` only reads this when it builds a
  // Chat, which is exactly when `threadId` changes, and subscribing
  // would rerender the whole conversation on every persisted token.
  const storedMessages =
    useAssistantConversationsStore.getState().threads[threadId] ?? EMPTY_THREAD

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
    stop,
    error,
    regenerate,
    addToolResult,
  } = useChat({
    // Changing this is what swaps threads: the SDK rebuilds its Chat
    // around `messages` whenever the id moves.
    id: threadId,
    messages: storedMessages,
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
    onFinish: () => {
      track('assistant_run_completed', {
        outcome: 'success',
        tool_calls: runToolCallsRef.current,
        duration_ms: runStartRef.current ? Date.now() - runStartRef.current : 0,
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

  // ── Local persistence ─────────────────────────────────────────────
  //
  // Threads are written to this device and nowhere else. There is no
  // account copy any more, which is why the whole `UIMessage` goes down
  // rather than the flattened text the server used to accept: tool
  // calls, research cards and order proposals all come back on reload.
  //
  // Debounced, because a streaming answer changes the array on every
  // token and serializing a long thread that often would be felt. The
  // pending write carries the id it was scheduled for, so a flush that
  // lands after a switch still writes to the thread it came from.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const pendingWriteRef = useRef<{
    id: string
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  const writeThreadNow = useCallback((id: string) => {
    const pending = pendingWriteRef.current
    if (pending?.id === id) {
      clearTimeout(pending.timer)
      pendingWriteRef.current = null
    }
    useAssistantConversationsStore
      .getState()
      .setMessages(id, messagesRef.current)
  }, [])

  useEffect(() => {
    // An empty thread is left alone. Opening the dock and closing it
    // again should not stamp a conversation as touched.
    if (messages.length === 0) return
    // A finished run is written at once: the answer is complete and the
    // window may be closed the moment it lands.
    if (status === 'ready' || status === 'error') {
      writeThreadNow(threadId)
      return
    }
    if (pendingWriteRef.current?.id === threadId) return
    const timer = setTimeout(() => {
      pendingWriteRef.current = null
      useAssistantConversationsStore
        .getState()
        .setMessages(threadId, messagesRef.current)
    }, PERSIST_DEBOUNCE_MS)
    pendingWriteRef.current = { id: threadId, timer }
  }, [messages, status, threadId, writeThreadNow])

  useEffect(
    () => () => {
      const pending = pendingWriteRef.current
      if (pending) clearTimeout(pending.timer)
    },
    [],
  )

  // ── Switching threads ─────────────────────────────────────────────
  //
  // Runs BEFORE `threadId` moves, which is the whole reason the chat is
  // not keyed off the store directly. Stop first so nothing keeps
  // streaming into a Chat about to be discarded, then write what did
  // arrive, then let the render that swaps the thread happen.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    if (conversationId === threadId) return
    stopRef.current()
    if (messagesRef.current.length > 0) writeThreadNow(threadId)
    // Chart captures are held in memory and never written down, so they
    // cannot follow a thread across a reload anyway. Dropping them here
    // is what keeps a long session of switching from accumulating PNGs
    // for threads nobody is looking at.
    clearScreenshots()
    setThreadId(conversationId)
  }, [conversationId, threadId, writeThreadNow])

  // ── Naming the thread ─────────────────────────────────────────────
  //
  // The first user message titles it immediately, so the rail never
  // shows a nameless row, and the model is asked in the background for
  // something better. One attempt per thread: a title that failed to
  // generate is not worth retrying on every render, and the fallback is
  // already readable.
  const titledRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (messages.length === 0 || titledRef.current.has(threadId)) return
    const first = messages.find((message) => message.role === 'user')
    const seed = first ? textOf(first) : ''
    if (!seed.trim()) return
    titledRef.current.add(threadId)

    const store = useAssistantConversationsStore.getState()
    const existing = store.conversations.find((meta) => meta.id === threadId)
    if (existing?.title) return
    store.rename(threadId, titleFromText(seed))

    let cancelled = false
    void generateConversationTitle(depsRef.current.pluginManager, seed).then(
      (title) => {
        if (cancelled || !title) return
        useAssistantConversationsStore.getState().rename(threadId, title)
      },
    )
    return () => {
      cancelled = true
    }
  }, [messages, threadId])

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

  /**
   * Bumped whenever the user puts something into the thread. Scrolling up
   * parks the view, and that is right for reading, but it must not outlive
   * the user's own send: writing a message is as explicit as it gets that
   * they want to see what happens next. Re-pinning here is also what makes
   * the answer follow, because the pin is what the growth observer checks.
   */
  const [jumpSignal, setJumpSignal] = useState(0)
  const jumpToLatest = useCallback(() => setJumpSignal((n) => n + 1), [])

  const send = useCallback(
    (text: string) => {
      runStartRef.current = Date.now()
      runToolCallsRef.current = 0
      jumpToLatest()
      sendMessage({ text })
    },
    [sendMessage, jumpToLatest],
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
        jumpToLatest()
        answerQuestion(pendingQuestion.toolCallId, text)
        return
      }
      if (status !== 'ready') {
        track('assistant_message_queued')
        // The queued turn renders at the end of the thread. Parking the
        // view above it would show nothing for the message they just
        // typed, which reads as the composer having swallowed it.
        jumpToLatest()
        setQueued(text)
        return
      }
      send(text)
    },
    [send, status, pendingQuestion, answerQuestion, jumpToLatest],
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
        jumpSignal={jumpSignal}
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
  jumpSignal,
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
  /** Bumped when the user sends: go to the bottom and re-pin, whatever
   * they had scrolled to. */
  jumpSignal: number
  onRegenerate?: () => void
}) {
  const { t } = useTranslation()
  const isStreaming = status === 'streaming' || status === 'submitted'
  const { contentRef, scrollToBottom, isPinned, hasUnseen } = useStickToBottom({
    enabled: isStreaming,
  })
  const lastId = messages[messages.length - 1]?.id

  // Runs after the render that added the message, so the height it scrolls
  // to already includes it. Skips the initial value so opening a thread
  // does not yank a restored scroll position.
  const seenJump = useRef(jumpSignal)
  useEffect(() => {
    if (seenJump.current === jumpSignal) return
    seenJump.current = jumpSignal
    // Instant, not smooth. A smooth scroll fires scroll events all the way
    // down, and every one of them is read as "not at the bottom" while the
    // answer is already streaming in, which unpins the view and flashes the
    // chip at the user for the whole animation.
    scrollToBottom()
  }, [jumpSignal, scrollToBottom])

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
          onClick={() => scrollToBottom()}
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

/** Every text part of a message, joined. What a title is written from. */
function textOf(message: UIMessage): string {
  const chunks: Array<string> = []
  for (const part of message.parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      chunks.push(part.text)
    }
  }
  return chunks.join('\n')
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
