// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * P&L today — the one card in this build that is composed rather than reused,
 * because no pane draws it.
 *
 * The figure is the risk store's `dailyPnl` (the same number the guardrails
 * lock against, so the card and the block reason can never disagree), and the
 * sub-line counts positions and venues.
 *
 * Those counts come straight from the balances store rather than from
 * `usePortfolioValue`. The card shows no prices, and that hook opens a ticker
 * subscription per held asset and re-renders on every tick of every one of
 * them — a real cost on a phone for two integers. `getBalances()` already
 * filters to non-zero holdings, which is exactly the definition of "position"
 * this line means.
 *
 * The card is a door: tapping it opens the P&L screen, where the same figure
 * gets its window, its guardrail and the holdings behind it.
 */
import { memo, useCallback, useSyncExternalStore } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions } from '../mobile-focus-context'
import { PRESS } from '../primitives/press'
import type { ReactNode } from 'react'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { getBalances, subscribeBalances } from '@/stores/balances-store'

/**
 * The shared shell of both Discover stat cards: label, then whatever the card
 * measures. Lives here because this is the card that defines the geometry.
 *
 * With `onPress` it becomes a button and grows a chevron, so "there is more
 * behind this" is visible before the tap rather than discovered by it.
 */
export function StatCard({
  label,
  children,
  className,
  onPress,
}: {
  label: string
  children: ReactNode
  className?: string
  onPress?: () => void
}) {
  const body = (
    <>
      <p className="mb-2.5 flex items-center gap-1 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        {onPress ? (
          <ChevronRight
            aria-hidden
            className="-mr-0.5 size-3 shrink-0 opacity-70"
          />
        ) : null}
      </p>
      {children}
    </>
  )

  const shell = cn(
    'pl-field min-w-0 flex-1 rounded-[14px] p-3.5 [box-shadow:inset_0_0_0_1px_var(--pl-edge)]',
    className,
  )

  if (!onPress) return <div className={shell}>{body}</div>

  return (
    <button
      className={cn(shell, 'pl-press-row text-left')}
      onClick={onPress}
      type="button"
      {...PRESS}
    >
      {body}
    </button>
  )
}

export const DiscoverPnlCard = memo(function DiscoverPnlCard() {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const dailyPnl = useRiskConfigStore((s) => s.dailyPnl)
  const balances = useSyncExternalStore(
    subscribeBalances,
    getBalances,
    getBalances,
  )

  const positions = balances.length
  const venues = new Set(balances.map((b) => b.market)).size
  const flat = dailyPnl === 0

  const open = useCallback(() => pushOverlay({ kind: 'pnl' }), [pushOverlay])

  return (
    <StatCard label={t('mobile.panels.pnlToday')} onPress={open}>
      {/* A PERCENT, not the design's "+$1,000". `dailyPnl` is signed percent
          everywhere else in the product (the risk pane and the daily-loss
          guardrail both read it that way), and rendering it with a currency
          symbol would be a number this app never computed. */}
      <span
        className={cn(
          'block font-mono text-[30px] font-semibold leading-none tabular-nums tracking-[-0.02em]',
          flat ? 'text-foreground' : dailyPnl > 0 ? 'text-up' : 'text-down',
        )}
      >
        {dailyPnl > 0 ? '+' : ''}
        {dailyPnl.toFixed(2)}%
      </span>
      <p className="mt-2.5 text-[11px] leading-none text-muted-foreground">
        {positions === 0
          ? t('mobile.panels.noPositions')
          : `${t('mobile.panels.positionsCount', { count: positions })} · ${t('mobile.panels.venuesCount', { count: venues })}`}
      </p>
    </StatCard>
  )
})
