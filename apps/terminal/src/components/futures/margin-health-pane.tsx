// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Margin Health — how much room the account has before the venue takes over.
 *
 * One section per connected futures account, because a margin ratio is an
 * ACCOUNT fact: cross margin pools every position against one balance, and a
 * single merged gauge across two exchanges would be a number neither of them
 * would liquidate on.
 *
 * The ratio is computed from maintenance over equity rather than read off the
 * venue's own `marginRatio` field, which two of the three venues scale
 * differently (a fraction on one, percent on another) with nothing in the
 * payload to say which. Where the venue's figure is the only one available it
 * is normalised and used, and the header says the source.
 *
 * ADL is shown as unpublished rather than approximated. No unified ccxt call
 * returns an auto-deleveraging rank, and a five-bar indicator inferred from
 * margin health would look exactly like the venue's own and mean nothing.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Gauge } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import type { NormalizedPosition } from '@pairlens/market-engine/types'

import type { FuturesAccountPositions } from '@/hooks/use-futures-positions'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { formatCompactUsd } from '@/lib/format-price'
import {
  liquidationDistance,
  projectedMarginRatio,
} from '@/lib/futures/funding-math'
import {
  getBalances,
  subscribeBalances,
  venueBalanceCredentialKey,
} from '@/stores/balances-store'
import { useCredentialsStore } from '@/stores/credentials-store'
import {
  useFuturesAccounts,
  useFuturesPositions,
} from '@/hooks/use-futures-positions'
import { useFuturesFundingVenues } from '@/hooks/use-funding-rates'

/** Adverse moves the stress rows project. */
const STRESS_MOVES = [0.03, 0.06, 0.09] as const

/** Currencies that count as margin on a linear perp account. */
const SETTLE_CURRENCIES = new Set(['USDT', 'USDC', 'USD'])

/** Where the venue starts calling: the amber band on the gauge. */
const MARGIN_CALL_RATIO = 0.8

export function MarginHealthPane() {
  const { t } = useTranslation()
  const accounts = useFuturesAccounts()
  const { data: results, isPending } = useFuturesPositions(accounts)
  const status = useCredentialsStore((s) => s.status)
  const venues = useFuturesFundingVenues()
  const balances = useSyncExternalStore(subscribeBalances, getBalances)

  if (accounts.length === 0) {
    const venue = venues[0]
    if (!venue) {
      return (
        <PaneEmpty
          body={t('marginHealth.noVenueBody')}
          icon={Gauge}
          title={t('marginHealth.noVenueTitle')}
        />
      )
    }
    return (
      <PaneCredentialsRequired
        // Perp prices are public on every venue in the fleet; margin, leverage
        // and liquidation distance are not.
        kind="account"
        market={venue.market}
        state={status === 'sealed' ? 'sealed' : 'missing'}
        venueLabel={venue.label}
      />
    )
  }

  if (isPending) {
    return (
      <PaneEmpty
        body={t('funding.loading')}
        icon={Gauge}
        title={t('marginHealth.title')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      {results.map((result) => (
        <AccountSection
          balances={balances}
          key={`${result.account.market}:${result.account.credentialId}`}
          multiple={results.length > 1}
          result={result}
        />
      ))}
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

type BalanceRow = ReturnType<typeof getBalances>[number]

function AccountSection({
  result,
  balances,
  multiple,
}: {
  result: FuturesAccountPositions
  balances: Array<BalanceRow>
  multiple: boolean
}) {
  const { t } = useTranslation()
  const health = useMemo(
    () => accountHealth(result, balances),
    [result, balances],
  )

  if (result.error) {
    return (
      <PaneErrorBanner
        message={result.error}
        venue={result.account.venueLabel}
      />
    )
  }

  if (result.positions.length === 0) {
    return (
      <section className="rounded-lg border border-border p-3">
        {multiple && <AccountLabel result={result} />}
        <p className="text-xs text-muted-foreground">
          {t('marginHealth.flatBody')}
        </p>
      </section>
    )
  }

  const ratio = health.ratio
  return (
    <section className="flex flex-col gap-2.5">
      {multiple && <AccountLabel result={result} />}

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11.5px] text-muted-foreground">
            {t('marginHealth.marginRatio')}
          </span>
          <span
            className={cn(
              'font-mono text-[15px] font-semibold tabular-nums',
              ratioTone(ratio),
            )}
          >
            {ratio === null ? t('funding.na') : `${(ratio * 100).toFixed(1)}%`}
          </span>
        </div>
        {/* Green through amber to red across the whole track, with the marker
            at the account's own ratio: the gauge has to show how much of the
            distance is gone, not just a colour. */}
        <div
          className="relative mt-1.5 h-2 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, var(--chart-2), var(--chart-4) 62%, var(--destructive))',
          }}
        >
          {ratio !== null && (
            <span
              className="absolute -top-[3px] h-3.5 w-[3px] rounded-sm bg-foreground shadow-[0_0_0_1px_var(--background)]"
              style={{ left: `${Math.min(ratio, 1) * 100}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{t('marginHealth.safe')}</span>
          <span>{t('marginHealth.marginCall')}</span>
          <span>{t('marginHealth.liquidation')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={t('marginHealth.equity')}
          value={
            health.equity === null ? null : formatCompactUsd(health.equity)
          }
        />
        <Stat
          label={t('marginHealth.maintenance')}
          value={
            health.maintenance === null
              ? null
              : formatCompactUsd(health.maintenance)
          }
        />
        <Stat
          label={t('marginHealth.liqDistance')}
          tone="caution"
          value={
            health.liqDistance === null
              ? null
              : `${(health.liqDistance * 100).toFixed(1)}%`
          }
        />
        <Stat
          hint={t('marginHealth.adlHint')}
          label={t('marginHealth.adl')}
          value={null}
        />
      </div>

      {health.equity !== null &&
        health.maintenance !== null &&
        health.notional > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10.5px] text-muted-foreground">
              {t('marginHealth.stressLabel')}
            </p>
            {STRESS_MOVES.map((move) => {
              const projected = projectedMarginRatio({
                equity: health.equity!,
                maintenance: health.maintenance!,
                notional: health.notional,
                side: health.side,
                move,
              })
              const liquidated = projected !== null && projected >= 1
              return (
                <div className="flex items-center gap-2" key={move}>
                  <span className="w-11 shrink-0 font-mono text-[11px] tabular-nums">
                    -{(move * 100).toFixed(0)}%
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(projected ?? 0) * 100}%`,
                        background: liquidated
                          ? 'var(--destructive)'
                          : 'var(--chart-4)',
                      }}
                    />
                  </span>
                  <span
                    className={cn(
                      'w-20 shrink-0 text-right font-mono text-[11px] tabular-nums',
                      liquidated ? 'text-down' : 'text-muted-foreground',
                    )}
                  >
                    {projected === null
                      ? t('funding.na')
                      : liquidated
                        ? t('marginHealth.liquidated')
                        : t('marginHealth.ratioAfter', {
                            value: (projected * 100).toFixed(0),
                          })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
    </section>
  )
}

function AccountLabel({ result }: { result: FuturesAccountPositions }) {
  return (
    <p className="truncate text-[11px] font-medium text-muted-foreground">
      {result.account.venueLabel} · {result.account.accountLabel}
    </p>
  )
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string | null
  tone?: 'caution'
  hint?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className="truncate text-[10.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm font-semibold tabular-nums',
          tone === 'caution' && value !== null && 'text-[var(--chart-4)]',
          value === null && 'text-muted-foreground',
        )}
      >
        {value ?? t('funding.na')}
      </p>
      {hint && (
        <p className="mt-0.5 text-[9.5px] leading-tight text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

// ── Health ────────────────────────────────────────────────────────────

type AccountHealth = {
  equity: number | null
  maintenance: number | null
  ratio: number | null
  liqDistance: number | null
  notional: number
  side: 'long' | 'short'
}

/**
 * The account's margin picture from whatever the venue actually filled in.
 *
 * Equity prefers the balance the connector streams for this credential, and
 * falls back to the collateral the venue stamped on the positions themselves —
 * on cross margin those are the same pool, and one of the two is always
 * present.
 */
export function accountHealth(
  result: FuturesAccountPositions,
  balances: Array<BalanceRow>,
): AccountHealth {
  const key = venueBalanceCredentialKey(
    result.account.credentialId,
    result.account.market,
  )
  let equity: number | null = null
  for (const balance of balances) {
    if (balance.credentialId !== key) continue
    if (!SETTLE_CURRENCIES.has(balance.currency.toUpperCase())) continue
    const total = Number(balance.total)
    if (!Number.isFinite(total)) continue
    equity = (equity ?? 0) + total
  }

  let maintenance: number | null = null
  let collateral: number | null = null
  let notional = 0
  let longNotional = 0
  let venueRatio: number | null = null
  let liqDistance: number | null = null

  for (const position of result.positions) {
    if (position.maintenanceMargin != null) {
      maintenance = (maintenance ?? 0) + position.maintenanceMargin
    }
    if (position.collateral != null) {
      collateral = (collateral ?? 0) + position.collateral
    }
    const size = positionNotional(position)
    notional += size
    if (position.side === 'long') longNotional += size
    if (position.marginRatio != null) {
      const normalized = normalizeRatio(position.marginRatio)
      if (
        normalized !== null &&
        (venueRatio === null || normalized > venueRatio)
      ) {
        venueRatio = normalized
      }
    }
    const distance = liquidationDistance(
      position.markPrice,
      position.liquidationPrice,
    )
    if (
      distance !== null &&
      (liqDistance === null || Math.abs(distance) < Math.abs(liqDistance))
    ) {
      liqDistance = distance
    }
  }

  const resolvedEquity = equity ?? collateral
  const ratio =
    resolvedEquity !== null && maintenance !== null && resolvedEquity > 0
      ? Math.min(maintenance / resolvedEquity, 1)
      : venueRatio

  return {
    equity: resolvedEquity,
    maintenance,
    ratio,
    liqDistance,
    notional,
    // The account's net lean, which is what a whole-account stress test moves
    // against. A hedged book nets out and the projection reads as gentle,
    // which is correct: it IS gentle.
    side: longNotional * 2 >= notional ? 'long' : 'short',
  }
}

/** ccxt venues disagree: some report a fraction, some a percentage. */
function normalizeRatio(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  return value > 1 ? Math.min(value / 100, 1) : value
}

function positionNotional(position: NormalizedPosition): number {
  if (position.notionalUsd != null && Number.isFinite(position.notionalUsd)) {
    return Math.abs(position.notionalUsd)
  }
  if (position.markPrice == null) return 0
  return position.contracts * (position.contractSize ?? 1) * position.markPrice
}

function ratioTone(ratio: number | null): string {
  if (ratio === null) return 'text-muted-foreground'
  if (ratio >= MARGIN_CALL_RATIO) return 'text-down'
  if (ratio >= 0.5) return 'text-[var(--chart-4)]'
  return 'text-up'
}
