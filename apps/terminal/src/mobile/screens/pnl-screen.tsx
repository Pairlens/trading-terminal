// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * P&L, full screen — the Discover card's number with its window, its guardrail
 * and the holdings behind it.
 *
 * ## What this number actually is
 *
 * `dailyPnl` is the risk store's running total for the CURRENT reset window,
 * fed by `PositionLedger.applyFill` on live order updates. That ledger is
 * session-scoped and average-cost: it realises a round trip it watched happen
 * and nothing else, so coins bought before this session sell for zero rather
 * than for an invented profit. Fees are not deducted. This screen says all of
 * that in one line, because a P&L figure with an unstated definition is worse
 * than no P&L figure — and because the same number is what the daily-loss
 * guardrail locks against, so the two must never be able to disagree.
 *
 * There is no per-position P&L to break it down into: the ledger keeps a cost
 * basis per pair, not a realised total per pair, and inventing one from
 * balances would be a number this app never computed. What the screen shows
 * instead is honest and useful: the window, the guardrail it feeds, and the
 * holdings each connected account reports.
 *
 * ## Prices without a ticker per asset
 *
 * Holdings are valued from `useBulkTickerQuotes` — one public REST snapshot per
 * venue, refreshed every 60s, already in cache because Discover uses it.
 * `usePortfolioValue` would be the desktop answer and it opens a WS ticker
 * subscription per held asset and re-renders on every tick of every one of
 * them, which is exactly what the mobile per-tick render rule forbids outside
 * the chart, the price readout and the book. When a price is missing the row
 * shows its amount and no value, which is what "we do not know" looks like.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { ChevronRight, Lock, ShieldCheck, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions } from '../mobile-focus-context'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { MobileRow } from '../primitives/mobile-row'
import { PRESS } from '../primitives/press'
import type { BalanceRecord } from '@/stores/balances-store'
import type { CryptoWallet } from '@/stores/wallets-store'
import type { ExchangeCredential } from '@/stores/credentials-store'
import type { MobileOverlay } from '../mobile-focus-context'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { getBalances, subscribeBalances } from '@/stores/balances-store'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { useDisplayCurrency } from '@/hooks/use-display-currency'
import { formatAmount, formatValue } from '@/lib/format-price'

/**
 * Treated as one unit of account. Same list `usePortfolioValue` carries; it is
 * duplicated rather than exported because the two paths price differently
 * (snapshots here, live tickers there) and a shared constant would imply they
 * are the same code.
 */
const USD_PEGGED = new Set([
  'USDT',
  'USDC',
  'DAI',
  'BUSD',
  'TUSD',
  'USDD',
  'USD',
])

/** Venues quote fiat the other way around: `USDT-EUR`, inverted to price EUR. */
const FIAT_CURRENCIES = new Set(['EUR', 'GBP'])

/** Reset-window names, as the settings section already words them. */
const INTERVAL_KEY: Record<string, string> = {
  '4h': 'settings.risk.interval4h',
  '12h': 'settings.risk.interval12h',
  daily: 'settings.risk.intervalDaily',
  weekly: 'settings.risk.intervalWeekly',
}

/** Breach actions, as the settings section already words them. */
const BREACH_ACTION_KEY: Record<string, string> = {
  block_all: 'settings.risk.actionBlockAll',
  block_buys: 'settings.risk.actionBlockBuys',
  warn: 'settings.risk.actionWarn',
  off: 'settings.risk.actionOff',
}

type Holding = {
  currency: string
  amount: number
  /** In the display currency, or null when nothing prices it right now. */
  value: number | null
}

type AccountGroup = {
  id: string
  /** The user's own name for the account, or the venue when it has none. */
  label: string
  venue: string
  holdings: Array<Holding>
  /** Sum over the holdings that priced. A floor, not the value, when some did not. */
  total: number
  /** How many holdings had no price — one delisted dust token must not null the account. */
  unpriced: number
}

export default memo(function PnlScreen({
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'pnl' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()

  // The whole risk store: every field read here changes on a fill or on a
  // settings edit, never on a tick.
  const risk = useRiskConfigStore()
  const balances = useSyncExternalStore(subscribeBalances, getBalances)
  const credentials = useCredentialsStore((s) => s.credentials)
  const credentialsSealed = useCredentialsStore((s) => s.sealed)
  const credentialsLoaded = useCredentialsStore((s) => s.loaded)
  const loadCredentials = useCredentialsStore((s) => s.load)
  const wallets = useWalletsStore((s) => s.wallets)
  const walletsSealed = useWalletsStore((s) => s.sealed)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const loadWallets = useWalletsStore((s) => s.load)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const quotes = useBulkTickerQuotes()

  // Same boot the sibling account surfaces do — free-riding on the provider's
  // startup load would paint "nothing connected" during the keychain read.
  useEffect(() => {
    void loadCredentials()
    void loadWallets()
  }, [loadCredentials, loadWallets])
  const { currency, symbol } = useDisplayCurrency()
  // The canonical market id → display name map, the same one the context bar
  // names the focused venue with.
  const { markets } = useAvailableMarkets()

  const openRiskSettings = useCallback(
    () => pushOverlay({ kind: 'settings', section: 'risk' }),
    [pushOverlay],
  )
  const openConnect = useCallback(
    () => pushOverlay({ kind: 'connect' }),
    [pushOverlay],
  )

  // One FX hop for the whole screen, off the same snapshot map. Null means the
  // display currency has no quote right now, and every value drops out rather
  // than being printed in the wrong unit.
  const fxRate =
    currency === 'USD' ? 1 : (quotes.get(`USDT-${currency}`)?.price ?? null)

  const venueLabel = useCallback(
    (market: string) =>
      markets.find((m) => m.value === market)?.label ?? market.toUpperCase(),
    [markets],
  )

  const groups = useMemo(
    () =>
      groupBalances(balances, credentials, wallets, quotes, fxRate, venueLabel),
    [balances, credentials, wallets, quotes, fxRate, venueLabel],
  )

  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0)
  const anyUnpriced = groups.some((group) => group.unpriced > 0)
  const anyPriced = groups.some(
    (group) => group.holdings.length > group.unpriced,
  )

  const flat = risk.dailyPnl === 0
  // Sealed ≠ empty: a locked vault still HOLDS accounts, and reporting them
  // as absent invites the user to re-enter keys they already stored.
  const vaultSealed = credentialsSealed || walletsSealed
  const nothingConnected =
    !vaultSealed &&
    credentialsLoaded &&
    walletsLoaded &&
    credentials.length === 0 &&
    wallets.length === 0
  const locked = risk.ordersLocked || risk.buyOrdersLocked

  return (
    <FullScreenOverlay
      display
      onBack={onClose}
      title={t('mobile.panels.pnlToday')}
    >
      <div className="pb-8">
        <section className="px-4 pt-1">
          <span
            className={cn(
              'block font-mono text-[52px] font-semibold leading-none tabular-nums tracking-[-0.03em]',
              flat
                ? 'text-foreground'
                : risk.dailyPnl > 0
                  ? 'text-up'
                  : 'text-down',
            )}
          >
            {risk.dailyPnl > 0 ? '+' : ''}
            {risk.dailyPnl.toFixed(2)}%
          </span>
          {/* Window, trades and reset cadence on one line: three fragments of
              the same fact, and "Daily" stranded on a line of its own read as
              a heading for the paragraph under it. */}
          <p className="mt-3 text-[12.5px] leading-snug text-muted-foreground">
            {t('mobile.pnl.windowSince', {
              time: windowStartLabel(risk.windowStart),
            })}
            {' · '}
            {t('mobile.pnl.tradesCount', { count: risk.dailyTradeCount })}
            {' · '}
            {t(
              INTERVAL_KEY[risk.resetInterval] ?? 'settings.risk.intervalDaily',
            )}
          </p>
          <p className="mt-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {t('mobile.pnl.explainer')}
          </p>
        </section>

        {locked ? (
          <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl bg-down/10 px-3.5 py-3">
            <Lock className="mt-px size-4 shrink-0 text-down" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight text-down">
                {risk.ordersLocked
                  ? t('settings.risk.lockBanner')
                  : t('settings.risk.lockBannerBuys')}
              </span>
              <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
                {t('mobile.pnl.lockedHint')}
              </span>
            </span>
          </div>
        ) : null}

        <SectionLabel>{t('mobile.pnl.guardrailLabel')}</SectionLabel>
        {risk.maxDailyLoss > 0 ? (
          <div className="mx-4 rounded-xl bg-[color:var(--pl-wash)] px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--pl-edge)]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-foreground">
                {t('mobile.pnl.guardrailUsed', {
                  used: Math.abs(Math.min(risk.dailyPnl, 0)).toFixed(2),
                  cap: risk.maxDailyLoss,
                })}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {t(
                  BREACH_ACTION_KEY[risk.dailyLossAction] ??
                    'settings.risk.actionOff',
                )}
              </span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--pl-wash-strong)]">
              <div
                className="h-full rounded-full bg-down"
                style={{
                  width: `${Math.min(
                    100,
                    (Math.abs(Math.min(risk.dailyPnl, 0)) / risk.maxDailyLoss) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="px-4 text-[12.5px] leading-relaxed text-muted-foreground">
            {t('mobile.pnl.noLimit')}
          </p>
        )}

        <MobileRow
          className="mt-3"
          leading={
            <ShieldCheck className="size-[18px] text-muted-foreground" />
          }
          onPress={openRiskSettings}
          title={t('mobile.pnl.riskSettings')}
          trailing={
            <ChevronRight className="size-4 text-muted-foreground/70" />
          }
        />

        <SectionLabel
          action={anyPriced ? formatValue(symbol, grandTotal) : undefined}
        >
          {t('mobile.pnl.holdingsLabel')}
        </SectionLabel>

        {/* Data first, invitation second: a balance the app is holding must
            never be hidden behind "nothing connected yet". */}
        {groups.length > 0 ? (
          <>
            {groups.map((group) => (
              <AccountHoldings group={group} key={group.id} symbol={symbol} />
            ))}
            <p className="px-4 pt-3 text-[11px] leading-relaxed text-muted-foreground">
              {fxRate == null
                ? t('mobile.pnl.noFxRate', { currency })
                : anyUnpriced
                  ? t('mobile.pnl.someUnpriced')
                  : t('mobile.pnl.pricedFrom')}
            </p>
          </>
        ) : vaultSealed ? (
          <div className="mx-4 rounded-xl bg-[color:var(--pl-wash)] px-4 py-5 text-center shadow-[inset_0_0_0_1px_var(--pl-edge)]">
            <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[color:var(--pl-wash)]">
              <Lock className="size-5 text-muted-foreground" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-foreground">
              {t('mobile.accounts.sealedTitle')}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {t('accounts.vaultSealedBody')}
            </p>
            <button
              className="pl-press mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
              onClick={() => setUnlockOpen(true)}
              type="button"
              {...PRESS}
            >
              {t('security.vault.sealedBannerAction')}
            </button>
          </div>
        ) : nothingConnected ? (
          <div className="mx-4 rounded-xl bg-[color:var(--pl-wash)] px-4 py-5 text-center shadow-[inset_0_0_0_1px_var(--pl-edge)]">
            <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[color:var(--pl-wash)]">
              <Wallet className="size-5 text-muted-foreground" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-foreground">
              {t('mobile.pnl.connectTitle')}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {t('mobile.pnl.connectBody')}
            </p>
            <button
              className="pl-press mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
              onClick={openConnect}
              type="button"
              {...PRESS}
            >
              {t('accounts.connect')}
            </button>
          </div>
        ) : (
          <p className="px-4 text-[12.5px] leading-relaxed text-muted-foreground">
            {t('mobile.pnl.noPositionsBody')}
          </p>
        )}
      </div>
      <VaultUnlockDialog onOpenChange={setUnlockOpen} open={unlockOpen} />
    </FullScreenOverlay>
  )
})

function AccountHoldings({
  group,
  symbol,
}: {
  group: AccountGroup
  symbol: string
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 border-t border-t-[color:var(--pl-hairline)] px-4 pb-1.5 pt-4">
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {group.label}
        </span>
        {/* The venue only when it adds something: an account the user never
            renamed is already titled with its venue, and "Binance · Binance"
            is a row explaining itself to itself. A `~` marks a total some
            holdings could not join — a floor, not the account's value. */}
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
          {group.holdings.length > group.unpriced
            ? `${group.unpriced > 0 ? '~' : ''}${formatValue(symbol, group.total)}`
            : group.label === group.venue
              ? ''
              : group.venue}
        </span>
      </div>
      {group.holdings.map((holding) => (
        <div
          className="flex min-h-10 items-center gap-3 px-4 py-1.5"
          key={holding.currency}
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-foreground">
            {holding.currency}
          </span>
          <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-muted-foreground">
            {formatAmount(holding.amount)}
          </span>
          <span className="w-[76px] shrink-0 text-right font-mono text-[12.5px] tabular-nums text-foreground">
            {holding.value != null ? formatValue(symbol, holding.value) : '—'}
          </span>
        </div>
      ))}
    </>
  )
}

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode
  action?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-6">
      <h3 className="text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
        {children}
      </h3>
      {action ? (
        <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
          {action}
        </span>
      ) : null}
    </div>
  )
}

/** Local time the current reset window opened, e.g. "09:14". */
function windowStartLabel(windowStart: number): string {
  const date = new Date(windowStart)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Balances → one block per connected account, priced where a snapshot allows.
 *
 * DEX balances are namespaced `walletId@market` (see `dexBalanceCredentialKey`),
 * so the wallet lookup has to split before it matches — the same shape the
 * balances store documents.
 */
function groupBalances(
  balances: Array<BalanceRecord>,
  credentials: Array<ExchangeCredential>,
  wallets: Array<CryptoWallet>,
  quotes: Map<string, { price: number }>,
  fxRate: number | null,
  venueLabel: (market: string) => string,
): Array<AccountGroup> {
  const priceOf = (ccy: string): number | null => {
    if (fxRate == null) return null
    if (USD_PEGGED.has(ccy)) return fxRate
    if (FIAT_CURRENCIES.has(ccy)) {
      const inverse = quotes.get(`USDT-${ccy}`)
      return inverse && inverse.price > 0 ? fxRate / inverse.price : null
    }
    const quote = quotes.get(`${ccy}-USDT`)
    return quote ? quote.price * fxRate : null
  }

  const byAccount = new Map<string, AccountGroup>()

  for (const balance of balances) {
    const amount = Number(balance.total)
    if (!(amount > 0)) continue

    let group = byAccount.get(balance.credentialId)
    if (!group) {
      const venue = venueLabel(balance.market)
      const credential = credentials.find((c) => c.id === balance.credentialId)
      const wallet = wallets.find(
        (w) => w.id === balance.credentialId.split('@')[0],
      )
      group = {
        id: balance.credentialId,
        label: credential?.label || wallet?.label || venue,
        venue,
        holdings: [],
        total: 0,
        unpriced: 0,
      }
      byAccount.set(balance.credentialId, group)
    }

    const price = priceOf(balance.currency)
    const value = price != null ? amount * price : null
    group.holdings.push({ currency: balance.currency, amount, value })
    if (value == null) group.unpriced += 1
    else group.total += value
  }

  const groups = [...byAccount.values()]
  for (const group of groups) {
    group.holdings.sort(
      (a, b) => (b.value ?? 0) - (a.value ?? 0) || b.amount - a.amount,
    )
  }
  return groups.sort((a, b) => b.total - a.total)
}
