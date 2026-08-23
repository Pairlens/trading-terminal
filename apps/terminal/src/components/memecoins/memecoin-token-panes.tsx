// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The memecoin trade board's own three panes: what the token is, who is
 * trading it, and what the deployer can still do to it.
 *
 * These exist instead of the DEX pool panes because a memecoin desk and a pool
 * desk answer different questions. A pool is read in reserves, fee tier and
 * price impact; a memecoin is read in market cap against supply, holder count,
 * buys against sells, and whether the mint authority is still live. Pointing a
 * pool-stats pane at a bonding curve produces four correct numbers nobody
 * asked for.
 *
 * All three take a mint from the pane's active pair. The pair id on this class
 * is `address-QUOTE`, so the base leg IS the mint and nothing has to be
 * resolved by symbol.
 */
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Coins, ShieldAlert, ShieldCheck } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import type {
  LaunchpadFlowWindow,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

import {
  PANE_TABLE_BODY,
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import {
  ChangeCell,
  CurveBar,
  FlowBar,
  StatLine,
  formatCount,
  formatMcap,
} from '@/components/memecoins/memecoin-pane-primitives'
import {
  FlowTableSkeleton,
  StatLinesSkeleton,
} from '@/components/memecoins/memecoin-skeletons'
import { useLaunchpadToken } from '@/hooks/use-launchpad'
import { usePanePair } from '@/lib/layout/pane-context'
import { registerDisplayToken } from '@/stores/token-directory-store'

/**
 * The mint from a memecoin pair key.
 *
 * Splits on the LAST separator, the same rule `normalizeInstrumentId` uses:
 * the quote is always a plain ticker and the base is an address that may
 * itself contain nothing else worth splitting on.
 */
function mintOf(pairKey: string | undefined): string | null {
  if (!pairKey) return null
  const at = pairKey.lastIndexOf('-')
  const base = at === -1 ? pairKey : pairKey.slice(0, at)
  return base.length > 0 ? base : null
}

/** The gate every one of these panes opens with. */
function useToken(): {
  token: LaunchpadToken | null
  isLoading: boolean
  error: string | null
  throttled: boolean
  bound: boolean
} {
  const activePair = usePanePair()
  const mint = mintOf(activePair?.pairKey)
  // The venue IS the chain on this class, and it is what routes the read: a
  // Legendary row opens on Ethereum or Base as often as on Solana.
  const state = useLaunchpadToken(mint, activePair?.market)

  // A COLD link is the case this covers: someone pastes a memecoin URL and no
  // board row ever taught the directory this mint's ticker, so the header
  // shows 44 characters of base58. The lookup already knows the symbol; this
  // is what publishes it. Display only, never identity.
  const market = activePair?.market
  const symbol = state.token?.symbol
  const name = state.token?.name
  useEffect(() => {
    if (!market || !mint || !symbol) return
    registerDisplayToken({
      chain: market,
      address: mint,
      symbol,
      ...(name ? { name } : {}),
    })
  }, [market, mint, symbol, name])

  return { ...state, bound: !!mint }
}

function PaneFrame({
  title,
  state,
  skeleton,
  children,
}: {
  title: string
  state: ReturnType<typeof useToken>
  /**
   * This pane's own shape, with the figures taken out.
   *
   * Passed in rather than drawn here: a list of stats and a four-row table are
   * different shapes, and one generic placeholder standing in for both would
   * reflow whichever it guessed wrong. The frame owns WHEN a skeleton shows,
   * the pane owns what it looks like.
   */
  skeleton: React.ReactNode
  children: (token: LaunchpadToken) => React.ReactNode
}) {
  const { t } = useTranslation()
  if (!state.bound) return <PanePairPicker />
  if (state.isLoading) {
    // No paced note here, unlike the four board columns. All three panes read
    // ONE lookup, so the explanation would be printed three times in one
    // column for a single request. The columns each own their own read.
    return (
      <div aria-busy className="flex h-full flex-col">
        <SkeletonStatus label={t('memecoins.loading')} />
        {skeleton}
      </div>
    )
  }
  if (!state.token) {
    return (
      <div className="flex h-full flex-col">
        {state.error ? (
          <PaneErrorBanner
            venue={title}
            message={
              state.throttled ? state.error : t('memecoins.unavailableBody')
            }
          />
        ) : (
          <PaneEmpty
            icon={Coins}
            title={t('memecoins.token.emptyTitle')}
            body={t('memecoins.token.emptyBody')}
          />
        )}
      </div>
    )
  }
  return <div className="flex h-full flex-col">{children(state.token)}</div>
}

// ── Token Stats ──────────────────────────────────────────────────────

/**
 * The lines Token Stats always carries.
 *
 * Launchpad and organic score are absent from the list on purpose: both are
 * conditional on the answer (an EVM token has neither), so ghosting them would
 * promise two rows that then vanish. The five below are drawn unconditionally
 * by the real pane, so they are the honest shape to hold.
 */
const STATS_SKELETON_KEYS: ReadonlyArray<string> = [
  'memecoins.stats.marketCap',
  'memecoins.stats.fdv',
  'memecoins.stats.liquidity',
  'memecoins.stats.holders',
  'memecoins.stats.curve',
]

/** Market caps are wide, holder counts are not. */
const STATS_VALUE_WIDTHS = ['w-14', 'w-14', 'w-12', 'w-8', 'w-[74px]']

export function MemeTokenStatsPane() {
  const { t } = useTranslation()
  const state = useToken()
  return (
    <PaneFrame
      title={t('panes.memeTokenStats')}
      state={state}
      skeleton={
        <StatLinesSkeleton
          labels={STATS_SKELETON_KEYS.map((key) => t(key))}
          valueWidths={STATS_VALUE_WIDTHS}
        />
      }
    >
      {(token) => (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <StatLine label={t('memecoins.stats.marketCap')}>
              {formatMcap(token.marketCapUsd)}
            </StatLine>
            <StatLine label={t('memecoins.stats.fdv')}>
              {formatMcap(token.fdvUsd)}
            </StatLine>
            <StatLine label={t('memecoins.stats.liquidity')}>
              {formatMcap(token.liquidityUsd)}
            </StatLine>
            <StatLine label={t('memecoins.stats.holders')}>
              {formatCount(token.holders)}
            </StatLine>
            {token.launchpad ? (
              <StatLine label={t('memecoins.stats.launchpad')}>
                {token.launchpad}
              </StatLine>
            ) : null}
            <StatLine label={t('memecoins.stats.curve')}>
              {token.graduatedAt ? (
                <span className="text-up">
                  {t('memecoins.stats.graduated')}
                </span>
              ) : (
                <CurveBar
                  progress={token.curveProgress}
                  estimated={token.source !== 'jupiter-gems'}
                />
              )}
            </StatLine>
            {token.organicScore !== null ? (
              <StatLine label={t('memecoins.stats.organicScore')}>
                {Math.round(token.organicScore)}
              </StatLine>
            ) : null}
          </div>
        </>
      )}
    </PaneFrame>
  )
}

// ── Buy / Sell Flow ──────────────────────────────────────────────────

const WINDOWS: ReadonlyArray<{ id: LaunchpadFlowWindow; labelKey: string }> = [
  { id: 'm5', labelKey: 'memecoins.flow.m5' },
  { id: 'h1', labelKey: 'memecoins.flow.h1' },
  { id: 'h6', labelKey: 'memecoins.flow.h6' },
  { id: 'h24', labelKey: 'memecoins.flow.h24' },
]

export function MemeFlowPane() {
  const { t } = useTranslation()
  const state = useToken()
  return (
    <PaneFrame
      title={t('panes.memeFlow')}
      state={state}
      // The real table, headers and window labels included. Both are the
      // pane's own structure rather than anything the feed decides.
      skeleton={
        <div className="min-h-0 flex-1">
          <table className={cn('w-full', PANE_TABLE_BODY)}>
            <thead>
              <tr>
                <Th>{t('memecoins.flow.window')}</Th>
                <Th align="right">{t('memecoins.columns.change')}</Th>
                <Th align="right">{t('memecoins.flow.volume')}</Th>
                <Th align="right">{t('memecoins.columns.flow')}</Th>
              </tr>
            </thead>
            <tbody>
              <FlowTableSkeleton
                windowLabels={WINDOWS.map((w) => t(w.labelKey))}
              />
            </tbody>
          </table>
        </div>
      }
    >
      {(token) => {
        const populated = WINDOWS.filter((w) => token.flow[w.id])
        if (populated.length === 0) {
          return (
            <PaneEmpty
              icon={Activity}
              title={t('memecoins.flow.emptyTitle')}
              body={t('memecoins.flow.emptyBody')}
            />
          )
        }
        return (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className={cn('w-full', PANE_TABLE_BODY)}>
                <thead>
                  <tr>
                    <Th>{t('memecoins.flow.window')}</Th>
                    <Th align="right">{t('memecoins.columns.change')}</Th>
                    <Th align="right">{t('memecoins.flow.volume')}</Th>
                    <Th align="right">{t('memecoins.columns.flow')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {populated.map((w) => {
                    const flow = token.flow[w.id]!
                    return (
                      <tr key={w.id} className="border-none">
                        <td className="py-1 pr-3">{t(w.labelKey)}</td>
                        <td className="py-1 pr-3 text-right">
                          <ChangeCell percent={flow.priceChangePercent} />
                        </td>
                        <td className="py-1 pr-3 text-right">
                          {formatMcap(flow.volumeUsd)}
                        </td>
                        <td className="py-1 text-right">
                          <FlowBar flow={flow} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      }}
    </PaneFrame>
  )
}

// ── Token Safety ─────────────────────────────────────────────────────

/**
 * One audit line, in three states rather than two.
 *
 * `null` is UNKNOWN and it renders as unknown. That distinction is the whole
 * point of the pane: a source that published no audit must never paint a green
 * check, because a green check here is read as permission to size up.
 */
function SafetyLine({
  label,
  safe,
  safeText,
  unsafeText,
}: {
  label: string
  safe: boolean | null
  safeText: string
  unsafeText: string
}) {
  const { t } = useTranslation()
  return (
    <StatLine label={label}>
      {safe === null ? (
        <span className="text-muted-foreground">{t('memecoins.unknown')}</span>
      ) : safe ? (
        <span className="flex items-center gap-1 text-up">
          <ShieldCheck className="size-3" />
          {safeText}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-down">
          <ShieldAlert className="size-3" />
          {unsafeText}
        </span>
      )}
    </StatLine>
  )
}

/**
 * The three audit lines every source is asked for. Deployer mints is left out
 * for the same reason the launchpad line is: it only exists when the source
 * published one.
 */
const SAFETY_SKELETON_KEYS: ReadonlyArray<string> = [
  'memecoins.safety.mintAuthority',
  'memecoins.safety.freezeAuthority',
  'memecoins.safety.topHolders',
]

const SAFETY_VALUE_WIDTHS = ['w-12', 'w-12', 'w-8']

export function MemeSafetyPane() {
  const { t } = useTranslation()
  const state = useToken()
  return (
    <PaneFrame
      title={t('panes.memeSafety')}
      state={state}
      skeleton={
        <StatLinesSkeleton
          labels={SAFETY_SKELETON_KEYS.map((key) => t(key))}
          valueWidths={SAFETY_VALUE_WIDTHS}
        />
      }
    >
      {(token) => {
        const audit = token.audit
        if (!audit) {
          return (
            <PaneEmpty
              icon={ShieldAlert}
              title={t('memecoins.safety.emptyTitle')}
              body={t('memecoins.safety.emptyBody')}
            />
          )
        }
        const concentrated =
          audit.topHoldersPercent !== null && audit.topHoldersPercent > 0.3
        return (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SafetyLine
                label={t('memecoins.safety.mintAuthority')}
                safe={audit.mintAuthorityDisabled}
                safeText={t('memecoins.safety.revoked')}
                unsafeText={t('memecoins.safety.live')}
              />
              <SafetyLine
                label={t('memecoins.safety.freezeAuthority')}
                safe={audit.freezeAuthorityDisabled}
                safeText={t('memecoins.safety.revoked')}
                unsafeText={t('memecoins.safety.live')}
              />
              <StatLine label={t('memecoins.safety.topHolders')}>
                {audit.topHoldersPercent === null ? (
                  <span className="text-muted-foreground">
                    {t('memecoins.unknown')}
                  </span>
                ) : (
                  <span className={cn(concentrated && 'text-down')}>
                    {(audit.topHoldersPercent * 100).toFixed(1)}%
                  </span>
                )}
              </StatLine>
              {audit.devMints !== null ? (
                <StatLine label={t('memecoins.safety.devMints')}>
                  {formatCount(audit.devMints)}
                  {audit.devMigrations !== null ? (
                    <span className="text-muted-foreground">
                      {' '}
                      /{' '}
                      {t('memecoins.safety.devMigrations', {
                        count: audit.devMigrations,
                      })}
                    </span>
                  ) : null}
                </StatLine>
              ) : null}
            </div>
          </>
        )
      }}
    </PaneFrame>
  )
}
