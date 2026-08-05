// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@pairlens/ui/components/ui/button'
import { Checkbox } from '@pairlens/ui/components/ui/checkbox'
import { cn } from '@pairlens/ui/lib/utils'
import { track } from '@/lib/analytics-events'
import {
  PROPOSAL_FRESHNESS_MS,
  markProposalExecuted,
  useTradeConsentStore,
  wasProposalExecuted,
} from '@/stores/trade-consent-store'

// ---------------------------------------------------------------------------
// Order confirmation card + actions context.
//
// The copilot's place_order / cancel_order tools NEVER execute — they return a
// proposal. This card is the human-in-the-loop gate: it renders the proposed
// order and only calls the risk-guarded MarketDataProvider.placeOrder /
// cancelOrder when the user explicitly confirms. Paper is preselected; live is
// an explicit second choice.
//
// "Don't ask again": the confirm step can be skipped by standing consent
// (trade-consent-store) — paper globally, live per market. Auto-execution is
// restricted to FRESH proposals (proposalId + proposedAt from the tool call,
// within PROPOSAL_FRESHNESS_MS) that were never executed before, so re-rendered
// chat history can never replay an order. Consent is revocable on the card.
// ---------------------------------------------------------------------------

export type CopilotOrderRequest = {
  market: string
  pair: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  size: number
  price?: number | null
  reason?: string | null
}

export type CopilotCancelRequest = {
  orderId: string
  market: string
  pair: string
}

export type OrderOutcome = {
  success: boolean
  orderId?: string
  error?: string
}

export type CopilotOrderActions = {
  placeOrder: (
    req: CopilotOrderRequest,
    mode: 'paper' | 'live',
  ) => Promise<OrderOutcome>
  cancelOrder: (req: CopilotCancelRequest) => Promise<OrderOutcome>
  /** The user's configured default trading mode (from settings). */
  tradingMode: 'paper' | 'live'
}

const CopilotOrderActionsContext = createContext<CopilotOrderActions | null>(
  null,
)

export const CopilotOrderActionsProvider = CopilotOrderActionsContext.Provider

export function useCopilotOrderActions(): CopilotOrderActions | null {
  return useContext(CopilotOrderActionsContext)
}

// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export function CopilotPlaceOrderCard({
  order,
  proposalId,
  proposedAt,
}: {
  order: CopilotOrderRequest
  /** Set by place_order for fresh proposals; absent on legacy history. */
  proposalId?: string
  proposedAt?: number
}) {
  const { t } = useTranslation()
  const actions = useCopilotOrderActions()
  const [mode, setMode] = useState<'paper' | 'live'>(
    actions?.tradingMode === 'live' ? 'live' : 'paper',
  )
  const [state, setState] = useState<'idle' | 'placing' | 'done'>('idle')
  const [outcome, setOutcome] = useState<OrderOutcome | null>(null)
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [autoApproved, setAutoApproved] = useState(false)

  const paperConsent = useTradeConsentStore((s) => s.paper)
  const liveConsent = useTradeConsentStore((s) =>
    s.liveMarkets.includes(order.market.toLowerCase()),
  )
  const setPaperAutoApprove = useTradeConsentStore((s) => s.setPaperAutoApprove)
  const setLiveAutoApprove = useTradeConsentStore((s) => s.setLiveAutoApprove)

  const isBuy = order.side === 'buy'

  const confirm = async (
    execMode: 'paper' | 'live',
    opts?: { grantConsent?: boolean; auto?: boolean },
  ) => {
    if (!actions || state !== 'idle') return
    setState('placing')
    track('trade_proposal_decided', {
      decision: 'accepted',
      mode: execMode,
      auto_approved: opts?.auto ?? false,
    })
    if (proposalId) markProposalExecuted(proposalId)
    if (opts?.grantConsent) {
      if (execMode === 'paper') setPaperAutoApprove(true)
      else setLiveAutoApprove(order.market, true)
    }
    try {
      const result = await actions.placeOrder(order, execMode)
      setOutcome(result)
    } catch (err) {
      setOutcome({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    setState('done')
  }

  // Auto-execute under standing consent — only for a fresh, never-executed
  // proposal, and only in the user's default trading mode.
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current || !actions || state !== 'idle') return
    if (!proposalId || !proposedAt) return
    if (Date.now() - proposedAt > PROPOSAL_FRESHNESS_MS) return
    if (wasProposalExecuted(proposalId)) return
    const defaultMode = actions.tradingMode === 'live' ? 'live' : 'paper'
    const covered = defaultMode === 'paper' ? paperConsent : liveConsent
    if (!covered) return
    autoRan.current = true
    setMode(defaultMode)
    setAutoApproved(true)
    void confirm(defaultMode, { auto: true })
    // Consent + proposal identity are fixed for the card's lifetime; this is
    // a mount-time decision, not a reactive one.
  }, [])

  return (
    <div className="border-border/60 bg-muted/40 elevated-panel rounded-lg border p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
            isBuy ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
          )}
        >
          {order.side === 'buy'
            ? t('positions.sideBuy')
            : t('positions.sideSell')}
        </span>
        <span className="font-semibold">{order.pair}</span>
        <span className="text-muted-foreground">
          · {order.market} ·{' '}
          {order.type === 'limit'
            ? t('copilot.orderTypeLimit')
            : t('copilot.orderTypeMarket')}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <dt>{t('copilot.fieldSize')}</dt>
          <dd className="text-foreground font-mono font-medium tabular-nums">
            {fmt(order.size)}
          </dd>
        </div>
        {order.type === 'limit' && order.price != null && (
          <div className="flex justify-between">
            <dt>{t('copilot.orderTypeLimit')}</dt>
            <dd className="text-foreground font-mono font-medium tabular-nums">
              {fmt(order.price)}
            </dd>
          </div>
        )}
      </dl>

      {order.reason && (
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          {order.reason}
        </p>
      )}

      {state === 'done' && outcome ? (
        <>
          <div
            className={cn(
              'mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px]',
              outcome.success ? 'bg-up/10 text-up' : 'bg-down/10 text-down',
            )}
          >
            {outcome.success ? (
              <>
                <CheckCircle2 className="size-3.5" />
                <span>
                  {mode === 'paper'
                    ? t('copilot.orderPlacedPaper')
                    : t('copilot.orderPlaced')}
                  {outcome.orderId ? ` · ${outcome.orderId}` : ''}
                </span>
              </>
            ) : (
              <>
                <XCircle className="size-3.5" />
                <span>{outcome.error ?? t('terminal.trade.orderFailed')}</span>
              </>
            )}
          </div>
          {autoApproved && (
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="size-3 text-primary" />
                {t('copilot.autoApprovedNote', {
                  mode:
                    mode === 'paper' ? t('accounts.paper') : t('accounts.live'),
                })}
              </span>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() =>
                  mode === 'paper'
                    ? setPaperAutoApprove(false)
                    : setLiveAutoApprove(order.market, false)
                }
              >
                {t('copilot.turnOff')}
              </button>
            </div>
          )}
        </>
      ) : autoApproved ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Zap className="size-3.5 text-primary" />
          {t('copilot.autoApproving', {
            mode: mode === 'paper' ? t('accounts.paper') : t('accounts.live'),
          })}
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          <div className="flex items-center gap-1 rounded-md bg-background/60 p-0.5">
            {(['paper', 'live'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                  mode === m
                    ? m === 'live'
                      ? 'bg-down/15 text-down'
                      : 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'live' ? t('accounts.live') : t('accounts.paper')}
              </button>
            ))}
          </div>
          {mode === 'live' && (
            <p className="flex items-center gap-1 text-[10px] text-amber-500">
              <AlertTriangle className="size-3" />
              {t('copilot.liveOrderWarning')}
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
              className="size-3.5"
            />
            {mode === 'paper'
              ? t('copilot.dontAskAgainPaper')
              : t('copilot.dontAskAgainLive', { market: order.market })}
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 flex-1 text-xs"
              disabled={state === 'placing' || !actions}
              onClick={() => confirm(mode, { grantConsent: dontAskAgain })}
            >
              {state === 'placing'
                ? t('copilot.placing')
                : t('copilot.confirmMode', {
                    mode:
                      mode === 'live'
                        ? t('accounts.live')
                        : t('accounts.paper'),
                  })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={state === 'placing'}
              onClick={() => {
                track('trade_proposal_decided', {
                  decision: 'rejected',
                  mode,
                  auto_approved: false,
                })
                setOutcome({ success: false, error: t('copilot.dismissed') })
                setState('done')
              }}
            >
              {t('common.dismiss')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CopilotCancelOrderCard({
  cancel,
}: {
  cancel: CopilotCancelRequest
}) {
  const { t } = useTranslation()
  const actions = useCopilotOrderActions()
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
  const [outcome, setOutcome] = useState<OrderOutcome | null>(null)

  const confirm = async () => {
    if (!actions || state !== 'idle') return
    setState('working')
    try {
      setOutcome(await actions.cancelOrder(cancel))
    } catch (err) {
      setOutcome({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    setState('done')
  }

  return (
    <div className="border-border/60 bg-muted/40 elevated-panel rounded-lg border p-3 text-xs">
      <p className="mb-2">
        {t('copilot.cancelOrderPrompt', {
          orderId: cancel.orderId,
          pair: cancel.pair,
          market: cancel.market,
        })}
      </p>
      {state === 'done' && outcome ? (
        <div
          className={cn(
            'flex items-center gap-1.5 text-[11px]',
            outcome.success ? 'text-up' : 'text-down',
          )}
        >
          {outcome.success ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <XCircle className="size-3.5" />
          )}
          <span>
            {outcome.success
              ? t('copilot.cancelled')
              : (outcome.error ?? t('copilot.cancelFailed'))}
          </span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="h-7 flex-1 text-xs"
            disabled={state === 'working' || !actions}
            onClick={confirm}
          >
            {state === 'working'
              ? t('copilot.cancelling')
              : t('copilot.confirmCancel')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={state === 'working'}
            onClick={() => {
              setOutcome({ success: false, error: t('copilot.dismissed') })
              setState('done')
            }}
          >
            {t('copilot.keep')}
          </Button>
        </div>
      )}
    </div>
  )
}
