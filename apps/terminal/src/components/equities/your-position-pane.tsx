// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What you hold in the symbol on screen, and nothing else.
 *
 * The positions table answers "what am I in"; this card answers "where am I on
 * THIS one", which is the question a chart and a ticket raise together. So it
 * is one symbol, both PnL figures the broker reports (open and today, which
 * are different numbers and both matter), and no table chrome.
 *
 * One section per account, because paper and live are two different books and
 * a card that summed them would show a position nobody holds.
 *
 * No live mark subscription: the broker reports mark, market value and both
 * PnL figures inside the positions payload, and the chart beside this pane is
 * already streaming the price.
 */
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { usePanePair } from '@pairlens/plugin-sdk'
import { cn } from '@pairlens/ui'
import type { NormalizedPosition } from '@pairlens/market-engine/types'

import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import {
  PANE_COLUMN_HEADER,
  PANE_TABLE_BODY,
  PaneEmpty,
  PaneErrorBanner,
} from '@/components/panes/pane-primitives'
import {
  equityTickerOf,
  useEquityAccounts,
  useEquityPositions,
  useEquityTradingVenue,
} from '@/hooks/use-equity-positions'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import {
  formatMoney,
  formatShares,
  formatSignedMoney,
} from '@/lib/equities/format'
import { formatPrice } from '@/lib/format-price'

export function YourPositionPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return <YourPositionPaneInner pairKey={activePair.pairKey} />
}

function YourPositionPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const ticker = equityTickerOf(pairKey)
  const venue = useEquityTradingVenue()
  const gate = useMarketCredentialGate(venue?.market ?? '')
  const accounts = useEquityAccounts()
  const { data } = useEquityPositions(accounts)

  if (!venue) {
    return (
      <PaneEmpty
        body={t('yourPosition.noVenueBody')}
        icon={Wallet}
        title={t('yourPosition.noVenueTitle')}
      />
    )
  }

  if (gate.state !== 'ok') {
    return (
      <PaneCredentialsRequired
        compact
        // The pane shows this account's own shares, cost basis and P&L, so the
        // sibling panes' "no public price feed" is the wrong reason here.
        kind="account"
        market={venue.market}
        state={gate.state}
        venueLabel={gate.venueLabel}
      />
    )
  }

  if (accounts.length === 0) {
    return (
      <PaneEmpty
        action={
          <Link
            className="mt-3 text-xs text-primary hover:underline"
            to="/accounts"
          >
            {t('yourPosition.connect')} →
          </Link>
        }
        body={t('yourPosition.noAccountsBody')}
        icon={Wallet}
        title={t('yourPosition.noAccountsTitle')}
      />
    )
  }

  // Only the accounts that have something to say about THIS symbol, plus any
  // that failed — a broker that refused the read is a fact, and hiding it
  // behind "no position" would be the pane lying about a holding.
  const held = data
    .map((result) => ({
      result,
      position:
        result.positions.find((p) => equityTickerOf(p.pair) === ticker) ?? null,
    }))
    .filter((row) => row.position !== null || row.result.error !== null)

  if (held.length === 0) {
    return (
      <PaneEmpty
        body={t('yourPosition.flatBody')}
        icon={Wallet}
        title={t('yourPosition.flatTitle', { symbol: ticker })}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto py-2">
      {held.map(({ result, position }) => (
        <AccountSection
          accountLabel={result.account.accountLabel}
          error={result.error}
          key={`${result.account.market}:${result.account.credentialId}`}
          multiple={held.length > 1}
          position={position}
          venueLabel={result.account.venueLabel}
        />
      ))}
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function AccountSection({
  accountLabel,
  venueLabel,
  position,
  error,
  multiple,
}: {
  accountLabel: string
  venueLabel: string
  position: NormalizedPosition | null
  error: string | null
  multiple: boolean
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      {multiple && <p className={PANE_COLUMN_HEADER}>{accountLabel}</p>}
      {error && <PaneErrorBanner message={error} venue={venueLabel} />}
      {position && <PositionCard position={position} />}
      {!position && !error && (
        <p className="text-[11px] text-muted-foreground">
          {t('yourPosition.flatBody')}
        </p>
      )}
    </section>
  )
}

function PositionCard({ position }: { position: NormalizedPosition }) {
  const { t } = useTranslation()
  const isShort = position.side === 'short'
  const pnl = position.unrealizedPnl
  // Percent against the money actually put in, not against the mark: a 4%
  // gain on cost is what a holder means by "up 4%".
  const costBasis =
    position.entryPrice != null
      ? position.entryPrice * position.contracts
      : null
  const pnlPct =
    pnl != null && costBasis != null && costBasis > 0
      ? (pnl / costBasis) * 100
      : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t(isShort ? 'yourPosition.sharesShort' : 'yourPosition.shares', {
            count: position.contracts,
            shares: formatShares(position.contracts),
          })}
        </span>
        <span
          className={cn(
            'font-mono text-[13px] font-semibold tabular-nums',
            signClass(pnl),
          )}
        >
          {signed(pnl)}
        </span>
      </div>

      {pnlPct !== null && (
        <Row label={t('yourPosition.openPnlPercent')}>
          <span className={signClass(pnl)}>
            {pnlPct > 0 ? '+' : ''}
            {pnlPct.toFixed(2)}%
          </span>
        </Row>
      )}
      <Row label={t('yourPosition.avgCost')}>
        {position.entryPrice != null ? formatPrice(position.entryPrice) : '—'}
      </Row>
      <Row label={t('yourPosition.mark')}>
        {position.markPrice != null ? formatPrice(position.markPrice) : '—'}
      </Row>
      <Row label={t('yourPosition.marketValue')}>
        {position.notionalUsd != null ? formatMoney(position.notionalUsd) : '—'}
      </Row>
      <Row label={t('yourPosition.dayChange')}>
        <span className={signClass(position.intradayPnl)}>
          {signed(position.intradayPnl)}
          {position.changeToday != null && (
            <span className="ml-1 text-muted-foreground">
              {position.changeToday > 0 ? '+' : ''}
              {(position.changeToday * 100).toFixed(2)}%
            </span>
          )}
        </span>
      </Row>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <span className={cn('text-foreground', PANE_TABLE_BODY)}>{children}</span>
    </div>
  )
}

/**
 * A signed money figure, or the absent-value glyph when the broker reported
 * none. Never `formatPrice`, which floors at zero and would render a losing
 * position as flat.
 */
function signed(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatSignedMoney(value)
}

function signClass(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return ''
  return value > 0 ? 'text-up' : 'text-down'
}
