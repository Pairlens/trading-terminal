// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Staking several answers to one question at once.
 *
 * A race is the one place where a trader's real position is a spread across
 * outcomes, and until now expressing that meant three trips through the
 * ticket, three confirmations, and no statement anywhere of what the three
 * legs cost together. This pane is the statement.
 *
 * Three numbers it exists to print, in the order a trader needs them:
 *
 *   coverage   the summed probability of the staked legs — "this basket
 *              covers 59% of the field".
 *   max payout the LARGEST leg's payout, never the sum. The legs are mutually
 *              exclusive; at most one of them pays. Summing them would
 *              advertise a return that cannot happen.
 *   max loss   the whole stake. Every leg is a buy, so the worst case is that
 *              none of them resolves true.
 *
 * Orders go out one at a time through the same guarded `placeOrder` as the
 * single-outcome ticket — the risk limits, the vault gate and the lock screen
 * are all inside it. They stop at the first refusal, and every leg that DID
 * fill is removed from the basket, so retrying after a rejection cannot place
 * the same order twice.
 *
 * Always limit-priced. Kalshi refuses market orders outright, and on a thin
 * race even where a market order is accepted a five-leg sweep is exactly the
 * order that walks a book. The price used is the ask when the venue publishes
 * one, because that is what buying actually costs.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ShoppingBasket, X } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'

import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import type { PredictionRunner } from '@/lib/predictions/race'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { TradeConfirmButton } from '@/components/terminal/trade-confirm-button'
import { usePanePair } from '@/lib/layout/pane-context'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { useMarketData } from '@/lib/market-data-provider'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'
import { credentialsForMarket } from '@/lib/venues/credential-alias'
import {
  basketEventKey,
  basketMath,
  useBasketStore,
} from '@/lib/predictions/basket-store'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import { eventOverround } from '@/lib/predictions/race'
import { formatPredictionPrice } from '@/lib/format-price'
import { tradeHoldMs } from '@/lib/settings/trade-confirm'

export function BasketTicketPane() {
  const { t } = useTranslation()
  const pane = usePanePair()
  const context = usePredictionEventContext(
    pane?.pairKey ?? '',
    pane?.market ?? '',
  )

  if (!pane) {
    return (
      <PaneEmpty
        body={t('basketTicket.noPairBody')}
        icon={ShoppingBasket}
        title={t('basketTicket.noPairTitle')}
      />
    )
  }

  return <Basket context={context} />
}

function Basket({ context }: { context: PredictionEventContext }) {
  const { t } = useTranslation()
  const { placeOrder, availableMarkets } = useMarketData()

  const credentials = useCredentialsStore((s) => s.credentials)
  const credentialsLoaded = useCredentialsStore((s) => s.loaded)
  const credentialsSealed = useCredentialsStore((s) => s.sealed)
  const loadCredentials = useCredentialsStore((s) => s.load)
  const wallets = useWalletsStore((s) => s.wallets)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const walletsSealed = useWalletsStore((s) => s.sealed)
  const loadWallets = useWalletsStore((s) => s.load)

  const legs = useBasketStore((s) => s.legs)
  const storeEventKey = useBasketStore((s) => s.eventKey)
  const setStake = useBasketStore((s) => s.setStake)
  const removeLeg = useBasketStore((s) => s.remove)
  const clearBasket = useBasketStore((s) => s.clear)

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadCredentials()
    loadWallets()
  }, [loadCredentials, loadWallets])

  const eventKey = context.event
    ? basketEventKey(context.venue, context.event.id)
    : null
  // Legs staged from a different event belong to a different question; the
  // store already replaced them, and this is the guard for the frame in
  // between.
  const ownLegs = eventKey && storeEventKey === eventKey ? legs : []

  const byPairKey = useMemo(() => {
    const map = new Map<string, PredictionRunner>()
    for (const runner of context.runners) map.set(runner.yes.pairKey, runner)
    return map
  }, [context.runners])

  // What buying costs, not what it last traded at. A basket sized off the last
  // print buys fewer contracts than it pays for.
  const priceOf = (pairKey: string): number | null => {
    const runner = byPairKey.get(pairKey)
    if (!runner) return null
    const value = runner.yes.ask ?? runner.yes.price
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return value > 0 && value < 1 ? value : null
  }

  const math = useMemo(
    () => basketMath(ownLegs, priceOf),
    // priceOf closes over the runner map, which is what actually changes.

    [ownLegs, byPairKey],
  )
  const overround = eventOverround(context.runners)

  const info = availableMarkets.find((m) => m.marketId === context.venue)
  const usesWallet = info?.walletChain != null
  const marketCreds = credentialsForMarket(credentials, context.venue)
  const chainWallets = usesWallet
    ? wallets.filter((w) => w.chain === info?.walletChain)
    : []
  const account = usesWallet ? chainWallets[0] : marketCreds[0]
  const sealed = usesWallet ? walletsSealed : credentialsSealed
  const loaded = usesWallet ? walletsLoaded : credentialsLoaded

  if (sealed || (loaded && !account)) {
    return (
      <PaneCredentialsRequired
        compact
        market={context.venue}
        state={sealed ? 'sealed' : 'missing'}
        venueLabel={context.venueLabel}
      />
    )
  }

  if (ownLegs.length === 0) {
    return (
      <PaneEmpty
        body={t('basketTicket.emptyBody')}
        icon={ShoppingBasket}
        title={t('basketTicket.emptyTitle')}
      />
    )
  }

  const placeable = ownLegs.filter(
    (leg) => (math.contracts[leg.pairKey] ?? 0) > 0,
  )

  const submit = async () => {
    if (!account || placeable.length === 0 || submitting) return
    setSubmitting(true)
    const placed: Array<string> = []
    try {
      for (const leg of placeable) {
        const price = priceOf(leg.pairKey)
        const contracts = math.contracts[leg.pairKey]
        if (price === null || !contracts) continue
        const result = await placeOrder({
          market: leg.market,
          pair: leg.pairKey,
          side: 'buy',
          type: 'limit',
          size: String(contracts),
          price: String(price),
          credentialId: account.id,
          analyticsSource: 'basket',
        })
        if (!result.success) {
          toast.error(t('basketTicket.partialTitle'), {
            description: t('basketTicket.partialBody', {
              placed: placed.length,
              total: placeable.length,
              outcome: leg.label,
              reason: result.error ?? t('common.unknownError'),
            }),
          })
          return
        }
        placed.push(leg.pairKey)
      }
      toast.success(t('basketTicket.placedTitle', { count: placed.length }), {
        description: t('basketTicket.placedBody'),
      })
    } catch (err) {
      toast.error(t('basketTicket.failedTitle'), { description: String(err) })
    } finally {
      // Whatever filled leaves the basket, whether the run finished or not:
      // a retry after a rejection must never re-place an order that already
      // went through.
      if (placed.length === ownLegs.length) clearBasket()
      else for (const pairKey of placed) removeLeg(pairKey)
      setSubmitting(false)
    }
  }

  const totalStake = math.totalStake
  const barTotal = ownLegs.reduce(
    (sum, leg) =>
      sum + (math.contracts[leg.pairKey] ?? 0) * (priceOf(leg.pairKey) ?? 0),
    0,
  )

  return (
    <div className="flex h-full flex-col gap-1.5 p-2.5">
      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
        {ownLegs.map((leg) => {
          const price = priceOf(leg.pairKey)
          const contracts = math.contracts[leg.pairKey] ?? 0
          return (
            <div className="flex items-center gap-1.5" key={leg.pairKey}>
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{
                  background: runnerToken(
                    runnerColorIndex(context.runners, leg.pairKey),
                  ),
                }}
              />
              <span
                className="min-w-0 flex-1 truncate text-[11.5px]"
                title={leg.label}
              >
                {leg.label}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                {price === null ? '—' : formatPredictionPrice(price)}
              </span>
              <Input
                aria-label={t('basketTicket.stakeFor', { name: leg.label })}
                className="h-6 w-14 shrink-0 rounded-md px-1.5 text-right font-mono text-[11px] tabular-nums"
                inputMode="decimal"
                onChange={(e) => setStake(leg.pairKey, e.target.value)}
                placeholder="0"
                value={leg.stake}
              />
              <span
                className={cn(
                  'w-11 shrink-0 text-right font-mono text-[11.5px] tabular-nums',
                  contracts > 0 ? 'text-up' : 'text-muted-foreground',
                )}
              >
                {contracts > 0 ? `$${contracts}` : '—'}
              </span>
              <button
                aria-label={t('basketTicket.removeLeg', { name: leg.label })}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => removeLeg(leg.pairKey)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>

      {barTotal > 0 && (
        <div className="mt-0.5 flex h-[7px] overflow-hidden rounded-full">
          {ownLegs.map((leg) => {
            const spent =
              (math.contracts[leg.pairKey] ?? 0) * (priceOf(leg.pairKey) ?? 0)
            if (spent <= 0) return null
            return (
              <span
                key={leg.pairKey}
                style={{
                  width: `${(spent / barTotal) * 100}%`,
                  background: runnerToken(
                    runnerColorIndex(context.runners, leg.pairKey),
                  ),
                }}
              />
            )
          })}
        </div>
      )}

      <div className="min-h-0 flex-1" />

      <dl className="flex flex-col gap-[3px] text-[11px] text-muted-foreground">
        <SummaryRow
          label={t('basketTicket.totalCost')}
          value={`$${totalStake.toFixed(2)}`}
        />
        <SummaryRow
          label={t('basketTicket.covers')}
          value={`${(math.coverage * 100).toFixed(1)}%`}
        />
        {overround && (
          <SummaryRow
            label={
              overround.basis === 'ask'
                ? t('basketTicket.overroundAsk')
                : t('basketTicket.overroundLast')
            }
            value={`${(overround.total * 100).toFixed(1)}%`}
            valueClassName={
              overround.edge > 0 ? 'text-[var(--chart-4)]' : 'text-up'
            }
          />
        )}
        <SummaryRow
          label={t('basketTicket.maxPayout')}
          value={math.bestPayout > 0 ? `$${math.bestPayout.toFixed(2)}` : '—'}
          valueClassName="text-up"
        />
        <SummaryRow
          label={t('basketTicket.maxLoss')}
          value={totalStake > 0 ? `$${totalStake.toFixed(2)}` : '—'}
          valueClassName="text-down"
        />
      </dl>

      {math.unusable.length > 0 && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {t('basketTicket.unusable', { count: math.unusable.length })}
        </p>
      )}

      <TradeConfirmButton
        busy={submitting}
        busyLabel={t('basketTicket.placing')}
        disabled={placeable.length === 0 || !account}
        holdMs={tradeHoldMs(true)}
        hint={t('basketTicket.hint')}
        label={t('basketTicket.place', { count: placeable.length })}
        onConfirm={() => void submit()}
        side="buy"
      />
    </div>
  )
}

function SummaryRow({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="truncate">{label}</dt>
      <dd
        className={cn(
          'shrink-0 font-mono tabular-nums text-foreground',
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  )
}
