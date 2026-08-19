// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mobile order ticket (design screens 7 and 9 — one component, two states).
 *
 * New chrome over reused logic, deliberately. `TradeEntryPanel` is not mounted
 * here: it is ~1400 lines of desktop layout around component-local state, and
 * the mobile ticket's limit price has to be shared with a chart overlay, which
 * means lifting that state whatever else happens. What IS reused is everything
 * that decides an outcome — `placeOrder` (the attended, guarded path, and the
 * ONLY way an order leaves this file), `useHoldConfirm` + `tradeHoldMs` for the
 * confirm gesture, `orderNotionalUsd` / `evaluatePositionSize` for the risk
 * row, `lib/predictions/ticket-math` for every figure on a prediction ticket
 * (dollars → contracts, fill price, payout, max loss), the credential and
 * wallet stores, and the same `trade:*` persisted preferences the desktop
 * ticket writes — stake presets included, so a list edited on the desk is the
 * list offered on the phone.
 *
 * Render budget: the ticket reads no stream context. The live price arrives
 * through a render-null probe that writes a ref on every tick and wakes this
 * component at most once a second, so a moving market never re-renders the
 * fields the user is typing into. The order-book strip and the risk row
 * subscribe on their own — they are leaves, and among the components allowed
 * to. Nothing that ticks may be read in THIS function body; a hook that looks
 * innocent (`useTradeRisk` did) puts every held asset's socket on the ticket's
 * render path.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Check, ChevronRight, KeyRound, Lock, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useOrderDraftStore } from '../lib/order-draft-store'
import { PRESS } from '../primitives/press'
import { predictionIdentity } from '../lib/prediction-identity'
import { PredictionOutcomeStrip } from './prediction-outcome-strip'
import { TradeOrderbookStrip } from './trade-orderbook-strip'
import { TradePayoutCard } from './trade-payout-card'
import { TradeRiskRow } from './trade-risk-row'
import { TradeSlideConfirm } from './trade-slide-confirm'
import { PredictionRules } from './prediction-rules'
import type { PredictionIdentity } from '../lib/prediction-identity'
import type { MobileOrderType } from '../lib/order-draft-store'
import type { ReactNode, RefObject } from 'react'
import { track } from '@/lib/analytics-events'
import { haptic } from '@/lib/haptics'
import { splitPairAssets } from '@/lib/pairs'
import {
  formatAmount,
  formatPredictionPrice,
  formatPrice,
} from '@/lib/format-price'
import { formatResolutionDate } from '@/lib/format-time'
import { useContractSize } from '@/lib/futures/contract-size'
import {
  balanceScopeFor,
  credentialsForMarket,
} from '@/lib/venues/credential-alias'
import {
  clampLeverage,
  contractsToBase,
  estimateLiquidationPrice,
  leveragePresets,
  perpNotional,
} from '@/lib/futures/ticket-math'
import {
  useOptionalCandleData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import { useMarketData } from '@/lib/market-data-provider'
import { useActiveWallet } from '@/lib/active-wallet-context'
import {
  CREDENTIAL_SCHEMAS,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'
import {
  dexBalanceCredentialKey,
  getBalances,
  subscribeBalances,
} from '@/stores/balances-store'
import { upsertOrderEvent } from '@/stores/order-events-store'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useTradeConfirmMode } from '@/hooks/use-trade-confirm'
import { tradeHoldMs } from '@/lib/settings/trade-confirm'
import { PluginBrandTile } from '@/components/plugins/plugin-icon'
import { venuePluginId, venuePosterSrc } from '@/components/accounts/venue-art'
import { CHAIN_NAME } from '@/components/terminal/wallet-selector'
import {
  centsToPrice,
  clampPriceCents,
  contractsForAmount,
  formatCollateral,
  normalizeContracts,
  predictionFillPrice,
  predictionPayout,
  priceToCents,
} from '@/lib/predictions/ticket-math'
import { predictionCollateral } from '@/lib/predictions/collateral'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'

// ── Live price, without a per-tick render ─────────────────────────────

type LivePrices = {
  last: number | null
  bestBid: number | null
  bestAsk: number | null
}

const EMPTY_PRICES: LivePrices = { last: null, bestBid: null, bestAsk: null }

/** How often a moving market is allowed to wake the ticket. */
const PRICE_SAMPLE_MS = 1000

/**
 * Renders null, subscribes to the two per-tick contexts, and does two things
 * with what it reads: writes the latest values into a ref (so the submit
 * handler always converts against a fresh price) and wakes its parent at most
 * once a second (so the market-order summary rows are not stale). This is the
 * repo's established isolation shape — the tick reaches this function, not the
 * tree.
 */
const LivePriceProbe = memo(function LivePriceProbe({
  target,
  onSample,
}: {
  target: RefObject<LivePrices>
  onSample: (prices: LivePrices) => void
}) {
  const ticker = useOptionalTickerData()
  const candleData = useOptionalCandleData()

  target.current = {
    last:
      ticker?.lastTradePrice ??
      ticker?.midPrice ??
      candleData?.latestCandle?.close ??
      null,
    bestBid: ticker?.bestBid ?? null,
    bestAsk: ticker?.bestAsk ?? null,
  }

  const lastEmit = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const now = Date.now()
    const due = lastEmit.current + PRICE_SAMPLE_MS
    if (now >= due) {
      lastEmit.current = now
      onSample(target.current)
      return
    }
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      lastEmit.current = Date.now()
      onSample(target.current)
    }, due - now)
  })

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return null
})

// ── Small helpers ─────────────────────────────────────────────────────

function toNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** A percentage of an available balance, trimmed to a typable string. */
function scaleAmount(available: string, pct: number): string {
  const n = parseFloat(available) * (pct / 100)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toFixed(8).replace(/\.?0+$/, '')
}

/** Base size for a quote-denominated amount at a price. */
function baseSizeAt(amount: number, price: number): string {
  return (amount / price).toFixed(8).replace(/\.?0+$/, '')
}

function formatAvailable(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000)
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n > 0) return n.toPrecision(4)
  return '0'
}

/**
 * Thousands separators for a resting field value, without touching what is
 * stored: the store keeps the raw parseable string and the field formats a
 * copy, so `Number(limitPrice)` is never a `NaN` from a comma.
 */
function formatFieldValue(raw: string, locale: string): string {
  const n = Number(raw)
  if (raw === '' || !Number.isFinite(n)) return raw
  const decimals = Math.min(8, (raw.split('.')[1] ?? '').length)
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function useBalance(currency: string, scope?: string): string {
  const balances = useSyncExternalStore(
    subscribeBalances,
    getBalances,
    getBalances,
  )
  for (const balance of balances) {
    if (scope && balance.credentialId !== scope) continue
    if (balance.currency === currency) return balance.total
  }
  return '0'
}

// ── Ticket ────────────────────────────────────────────────────────────

const PERCENTS = [25, 50, 75, 100] as const

export default memo(function MobileTradePanel() {
  const { t, i18n } = useTranslation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { pushOverlay } = useMobileActions()
  const {
    placeOrder,
    status: mdStatus,
    availableMarkets,
    refreshWalletBalances,
  } = useMarketData()

  const side = useOrderDraftStore((s) => s.side)
  const orderType = useOrderDraftStore((s) => s.orderType)
  const limitPrice = useOrderDraftStore((s) => s.limitPrice)
  const stopPrice = useOrderDraftStore((s) => s.stopPrice)
  const amount = useOrderDraftStore((s) => s.amount)
  const sizeCcy = useOrderDraftStore((s) => s.sizeCcy)
  const setSide = useOrderDraftStore((s) => s.setSide)
  const setOrderType = useOrderDraftStore((s) => s.setOrderType)
  const setLimitPrice = useOrderDraftStore((s) => s.setLimitPrice)
  const setStopPrice = useOrderDraftStore((s) => s.setStopPrice)
  const setAmount = useOrderDraftStore((s) => s.setAmount)
  const setSizeCcy = useOrderDraftStore((s) => s.setSizeCcy)
  const focusMarket = useOrderDraftStore((s) => s.focusMarket)
  const markTicketOpened = useOrderDraftStore((s) => s.markTicketOpened)
  const setTradeReady = useOrderDraftStore((s) => s.setTradeReady)
  const clearAmount = useOrderDraftStore((s) => s.clearAmount)

  const [submitting, setSubmitting] = useState(false)
  const pricesRef = useRef<LivePrices>(EMPTY_PRICES)
  const [prices, setPrices] = useState<LivePrices>(EMPTY_PRICES)
  const [slippageBps] = usePersistedState<number>('trade:slippageBps', 100)
  const [confirmMode] = useTradeConfirmMode()
  // The same slot the desktop ticket's stake chips write, so a preset edited on
  // the desk is the preset offered on the phone. Read-only here: editing the
  // list is a desktop affordance (a gear beside the row), and three chips plus
  // Max is the whole control at 402px.
  const [predictionPresets] = usePersistedState<Array<number>>(
    'trade:presets:predictionUsd',
    [25, 50, 100],
  )

  // The draft belongs to a (venue, pair); moving pair clears the numbers.
  useEffect(() => {
    focusMarket(focusedVenue, focusedPair)
  }, [focusMarket, focusedVenue, focusedPair])

  // The chart's limit line only appears once the ticket has been opened.
  useEffect(() => {
    markTicketOpened()
  }, [markTicketOpened])

  // ── Venue, credentials, wallet ──
  const credentials = useCredentialsStore((s) => s.credentials)
  const credentialsLoaded = useCredentialsStore((s) => s.loaded)
  const credentialsSealed = useCredentialsStore((s) => s.sealed)
  const loadCredentials = useCredentialsStore((s) => s.load)
  const wallets = useWalletsStore((s) => s.wallets)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const walletsSealed = useWalletsStore((s) => s.sealed)
  const loadWallets = useWalletsStore((s) => s.load)
  const { activeWallet } = useActiveWallet()

  useEffect(() => {
    loadCredentials()
    loadWallets()
  }, [loadCredentials, loadWallets])

  const marketInfo = availableMarkets.find((m) => m.marketId === focusedVenue)
  // Same split the desktop ticket makes: Polymarket signs with a chain wallet
  // AND trades contracts, and only the first half is a DEX question.
  const isPrediction = marketInfo?.assetClasses.includes('prediction') ?? false
  const usesWallet = marketInfo?.walletChain != null
  const isDex = usesWallet && !isPrediction
  // Read off the connector's declared asset classes rather than a venue
  // allowlist, so a second stock broker inherits both the session controls
  // below and the USD quote here for free.
  const isEquities = marketInfo?.assetClasses?.includes('stocks') === true
  // Perpetual futures. Independent of every flag above, exactly as on the
  // desktop ticket: a perp venue is a CEX that takes API keys, so `usesWallet`
  // stays false and the credential path is untouched. What it adds is
  // leverage, a reduce-only intent and a size counted in contracts.
  const isPerp = marketInfo?.assetClasses.includes('crypto-perp') ?? false
  const maxLeverage = marketInfo?.maxLeverage ?? 1

  // Derived after the venue is known: a stock's key is the bare ticker, so its
  // quote cannot come from the string.
  const { base: baseAsset, quote: quoteAsset } = splitPairAssets(focusedPair, {
    equity: isEquities,
  })
  const { contractSize, known: contractSizeKnown } = useContractSize(
    focusedVenue,
    focusedPair,
  )
  const showBaseEquivalent = isPerp && contractSizeKnown && contractSize !== 1
  const sizeAsset = sizeCcy === 'base' ? baseAsset : quoteAsset
  const venueLabel =
    marketInfo?.walletChain != null
      ? CHAIN_NAME[marketInfo.walletChain]
      : (CREDENTIAL_SCHEMAS[focusedVenue]?.label ??
        marketInfo?.displayName ??
        focusedVenue.toUpperCase())

  // Alias-resolved, like the desktop ticket: a futures venue signs with its
  // spot sibling's key, so a raw market match finds nothing for
  // `binance-futures` and the connect gate below fires on a connected account.
  const marketCreds = useMemo(
    () => credentialsForMarket(credentials, focusedVenue),
    [credentials, focusedVenue],
  )
  const chainWallets = useMemo(
    () =>
      usesWallet
        ? wallets.filter((w) => w.chain === marketInfo?.walletChain)
        : [],
    [usesWallet, wallets, marketInfo?.walletChain],
  )

  // The phone has no account switcher in the ticket: it trades from the
  // account the terminal already considers active, or from the venue's only
  // one. A venue with several accounts and none active picks the first —
  // choosing is a Settings › Accounts job, not a decision to block a trade on.
  const selectedCred = usesWallet
    ? undefined
    : (marketCreds.find((c) => c.id === activeWallet?.walletId) ??
      marketCreds[0])
  const selectedWallet = usesWallet
    ? (chainWallets.find((w) => w.id === activeWallet?.walletId) ??
      chainWallets[0])
    : undefined

  // Mirrors the desktop ticket's gate exactly: no key for the venue, no wallet
  // for the chain, or a connector that only streams prices. A SEALED vault is
  // excluded on purpose — the store is empty because it could not be read.
  const needsConnect =
    marketInfo != null &&
    !(usesWallet ? walletsSealed : credentialsSealed) &&
    (usesWallet ? walletsLoaded : credentialsLoaded) &&
    (!marketInfo.capabilities.includes('trade') ||
      (usesWallet ? chainWallets.length === 0 : marketCreds.length === 0))

  // Published for the chart's limit line: the draggable level only renders on
  // a ticket that can actually place an order (user-reported — the line was
  // floating over the ConnectCard). Live on purpose: connecting flips it on,
  // switching to an unconnected venue flips it off.
  useEffect(() => {
    setTradeReady(!needsConnect)
  }, [needsConnect, setTradeReady])

  const balanceScope = usesWallet
    ? selectedWallet
      ? dexBalanceCredentialKey(selectedWallet.id, focusedVenue)
      : undefined
    : selectedCred
      ? balanceScopeFor(selectedCred.id, focusedVenue)
      : undefined
  const availableBase = useBalance(baseAsset, balanceScope)
  const availableQuote = useBalance(quoteAsset, balanceScope)
  // A prediction pair key has no quote leg to read a balance for. Hooks cannot
  // be called in a loop, so every candidate is read and the shared rule picks
  // between them — the desktop ticket's own scan drifted from this list once.
  const collateralBalances: Record<string, string> = {
    USDC: useBalance('USDC', balanceScope),
    USD: useBalance('USD', balanceScope),
    USDT: useBalance('USDT', balanceScope),
  }
  const collateral = predictionCollateral((c) => collateralBalances[c])
  // What the Max chip stakes. Floored to cents rather than rounded, exactly as
  // on the desktop chip: a chip that asks for a hundredth of a cent more than
  // the account holds is a rejection with no visible cause.
  const maxCollateral = (() => {
    const total = Number(collateral.total)
    if (!Number.isFinite(total) || total <= 0) return ''
    return String(Math.floor(total * 100) / 100)
  })()

  // ── Prediction identity ──
  // The pair key is a venue ticker (`KXBTCD-26AUG15-T53`); what it MEANS was
  // pinned by the row that opened it. The context bar over the chart already
  // carries the subject and the side, so what the ticket adds is the question
  // itself and the date the collateral comes back — a 68¢ price a month out and
  // the same price an hour out are different bets, and the key carries neither.
  //
  // The pin alone was not enough. A shared `/pair/…` link opened on a fresh
  // profile has no pin at all, and the ticket used to render a bare Buy/Sell
  // form over an unnamed contract — money committed to a question nobody
  // printed. `usePredictionEventContext` re-reads the event from the venue and
  // fills every field the pin would have carried, so a cold link and a warm one
  // say the same thing. It costs nothing on a non-prediction venue: with no
  // prediction connector for `focusedVenue` the query is disabled outright.
  //
  // The preference order between the two sources lives in
  // `lib/prediction-identity.ts`, shared with the chart's event strip — the
  // ticket and the strip are one screen apart and must not name the same
  // contract differently.
  const eventContext = usePredictionEventContext(focusedPair, focusedVenue)
  const identity = predictionIdentity(eventContext)
  const outcomeLabel = identity?.outcomeLabel ?? ''
  const predictionEvent = identity?.event ?? null
  const predictionVenueLabel = identity?.venueLabel ?? ''

  // ── Order-type availability ──
  const supportsLimit = !isDex || marketInfo?.dexLimitOrders === true
  const supportsStop =
    !isDex && !isPrediction && marketInfo?.triggerOrders === true
  // Kalshi takes no market order at all; the segment is dropped rather than
  // disabled, and the draft is coerced so a stale 'market' cannot submit.
  const limitOnly = isPrediction && marketInfo?.limitOnly === true

  useEffect(() => {
    if (limitOnly && orderType !== 'limit') setOrderType('limit')
    if (orderType === 'limit' && !supportsLimit) setOrderType('market')
    if (orderType === 'stop' && !supportsStop) setOrderType('market')
  }, [orderType, limitOnly, supportsLimit, supportsStop, setOrderType])

  // ── Extended hours (equities) ──
  // Stocks trade on a session clock; outside it a limit order queues for the
  // next open unless it is explicitly routed to the pre-market/after-hours
  // book. Local state, never persisted: those sessions are thin enough that
  // the choice should be made per order, not inherited from last night.
  const [extendedHours, setExtendedHours] = useState(false)
  const extendedHoursEligible = isEquities && orderType === 'limit'
  useEffect(() => {
    if (!extendedHoursEligible && extendedHours) setExtendedHours(false)
  }, [extendedHoursEligible, extendedHours])

  // ── Leverage + reduce-only (perps) ──
  // Local state and never persisted, for the same reason extended hours is
  // not: 25x inherited from last night is a decision nobody is making now,
  // and a reduce-only flag carried onto a market with nothing open turns the
  // next order into a rejection.
  const [leverage, setLeverage] = useState(1)
  // Whether the user MOVED the selector on this market and pair. Leverage is
  // account state at the venue, not an order field: sending the ticket's
  // default 1x would quietly rewrite a 20x symbol set up elsewhere, and would
  // do it on orders that are only closing a position.
  const [leverageDirty, setLeverageDirty] = useState(false)
  const [reduceOnly, setReduceOnly] = useState(false)
  useEffect(() => {
    // Separate from the reset below: a venue switch can LOWER the ceiling, and
    // a leverage above it is a rejection at submit rather than a UI problem.
    setLeverage((current) => clampLeverage(current, maxLeverage))
  }, [maxLeverage])
  useEffect(() => {
    setLeverage(1)
    setLeverageDirty(false)
    setReduceOnly(false)
  }, [focusedVenue, focusedPair])

  // Seeding the price field from the live market is what puts the chart's
  // limit line where the user is looking instead of at zero. Seeded once per
  // (pair, order type): a field the user deliberately emptied stays empty.
  const seedKeyRef = useRef('')
  const seedPrice = useCallback(
    (next: MobileOrderType) => {
      const key = `${focusedPair}:${next}`
      if (seedKeyRef.current === key) return
      if (next === 'market') {
        seedKeyRef.current = key
        return
      }
      const live = pricesRef.current
      const reference =
        (side === 'buy' ? live.bestAsk : live.bestBid) ?? live.last
      if (reference == null) return
      seedKeyRef.current = key
      // Clamped, because the terminal produced this number rather than the user:
      // `priceToCents` rounds to tenths, so a 99.96¢ ask seeds exactly 100,
      // which is not a probability — the ticket would open on its own range
      // error and the chart's limit line would refuse to draw it.
      const seeded = isPrediction
        ? String(clampPriceCents(priceToCents(reference)))
        : String(Number(reference.toPrecision(8)))
      if (next === 'limit') {
        if (limitPrice === '') setLimitPrice(seeded)
      } else if (stopPrice === '') {
        setStopPrice(seeded)
      }
    },
    [
      focusedPair,
      isPrediction,
      side,
      limitPrice,
      stopPrice,
      setLimitPrice,
      setStopPrice,
    ],
  )

  // Covers the ticket that opens straight onto Limit: the probe's first sample
  // arrives after mount, and `prices` in the deps is what retries the seed.
  useEffect(() => {
    seedPrice(orderType)
  }, [seedPrice, orderType, prices])

  const handleOrderType = useCallback(
    (next: MobileOrderType) => {
      if (next !== orderType) haptic('selection')
      setOrderType(next)
      seedPrice(next)
    },
    [orderType, setOrderType, seedPrice],
  )

  // Buy/Sell and the order type are segment controls, which is the one control
  // class iOS itself ticks for — and here the segment repaints the whole
  // ticket, so the tick is confirming a change the user is about to type into.
  const handleSide = useCallback(
    (next: 'buy' | 'sell') => {
      if (next !== side) haptic('selection')
      setSide(next)
    },
    [side, setSide],
  )

  const handlePercent = useCallback(
    (pct: number) => {
      if (side === 'sell') {
        setSizeCcy('base')
        setAmount(scaleAmount(availableBase, pct))
        return
      }
      if (sizeCcy === 'quote') {
        setAmount(scaleAmount(availableQuote, pct))
        return
      }
      const reference =
        toNumber(orderType === 'limit' ? limitPrice : stopPrice) ||
        pricesRef.current.last ||
        0
      if (reference <= 0) return
      const quoteShare = parseFloat(availableQuote) * (pct / 100)
      setAmount(
        Number.isFinite(quoteShare) && quoteShare > 0
          ? baseSizeAt(quoteShare, reference)
          : '',
      )
    },
    [
      side,
      sizeCcy,
      availableBase,
      availableQuote,
      orderType,
      limitPrice,
      stopPrice,
      setAmount,
      setSizeCcy,
    ],
  )

  // ── Derived order figures ──
  const typedPrice = toNumber(orderType === 'limit' ? limitPrice : stopPrice)
  // Cents in the field, dollars everywhere else. One conversion, at the edge.
  // Null for anything outside (0, 100) cents. Every consumer refuses on null
  // rather than substituting a bound — a price left over from another
  // instrument is not a price, and clamping it bought the venue's worst fill.
  const predictionLimitPrice = isPrediction ? centsToPrice(limitPrice) : null
  const predictionPriceInvalid =
    isPrediction &&
    orderType === 'limit' &&
    limitPrice !== '' &&
    predictionLimitPrice === null
  // The price the order is SIZED against, which on a market order is the far
  // touch rather than the last trade: an outcome quoted 61 bid / 68 ask is a
  // 10% difference in how many contracts a hundred dollars buys, and sizing off
  // the last print would overstate the position by that much.
  const predictionPrice = isPrediction
    ? predictionFillPrice({
        limitPrice: orderType === 'limit' ? predictionLimitPrice : null,
        bid: prices.bestBid,
        ask: prices.bestAsk,
        last: prices.last,
        side,
      })
    : null
  const referencePrice = isPrediction
    ? predictionPrice
    : orderType === 'market'
      ? (prices.last ?? null)
      : typedPrice || null
  const sizeNumber = toNumber(amount)
  // Dollars in the field, contracts on the wire. This is the ONLY conversion —
  // the count under the field, the payout card, the risk row, the submit gate
  // and `placeOrder` all read this one number, so none of them can disagree
  // with what the user was shown. Floored inside `contractsForAmount`, so the
  // committed stake is always at or under what was typed.
  const predictionContracts = isPrediction
    ? Number(
        contractsForAmount({
          amountUsd: sizeNumber,
          price: predictionPrice,
          side,
        }),
      )
    : 0
  const payout = isPrediction
    ? predictionPayout({
        contracts: predictionContracts,
        price: predictionPrice,
        side,
      })
    : null
  const orderValue =
    sizeCcy === 'quote'
      ? sizeNumber
      : referencePrice != null
        ? sizeNumber * referencePrice
        : null

  // ── Perp order figures ──
  const perpBaseEquivalent =
    showBaseEquivalent && sizeNumber > 0
      ? contractsToBase(sizeNumber, contractSize)
      : null
  const perpNotionalValue = isPerp
    ? perpNotional({
        contracts: sizeNumber,
        contractSize,
        price: referencePrice,
      })
    : null
  const perpLiquidation = isPerp
    ? estimateLiquidationPrice({
        entryPrice: referencePrice,
        leverage,
        side,
      })
    : null

  // The risk verdict is computed inside `TradeRiskRow`, not here: the hook
  // behind it subscribes a ticker per held asset and re-renders on each tick,
  // which in this fiber would wake the whole ticket at socket rate and undo
  // `LivePriceProbe`. Only the one bit the submit gate needs comes back up,
  // and only when it changes.
  const [riskBlocks, setRiskBlocks] = useState(false)

  const isLiveOrder = usesWallet || selectedCred?.mode === 'live'
  // A stake that buys less than one whole contract is not an order the venue
  // can take, however valid the dollar figure in the field looks. Named rather
  // than inlined into the gate below: `trade-risk-gate.test.ts` reads that
  // expression as text, and a comment inside it truncates what the test sees.
  const predictionSizeOk = !isPrediction || predictionContracts >= 1

  const canSubmit =
    !needsConnect &&
    (usesWallet ? selectedWallet != null : selectedCred != null) &&
    mdStatus === 'connected' &&
    !submitting &&
    sizeNumber > 0 &&
    predictionSizeOk &&
    (orderType === 'market' ||
      (isPrediction ? predictionLimitPrice !== null : typedPrice > 0)) &&
    !riskBlocks

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const live = pricesRef.current
      const params: Record<string, unknown> = {
        market: focusedVenue,
        pair: focusedPair,
        side,
      }

      if (isPrediction) {
        // Contracts at a probability price. Ordered before the wallet branch:
        // Polymarket satisfies both tests and its orders are not swaps.
        const account = usesWallet ? selectedWallet : selectedCred
        if (!account) return
        params['credentialId'] = account.id
        // Contracts, whole — the venue counts them, and the field's dollars
        // were converted once, above, where the payout card read the same
        // figure. Sent as displayed rather than reconverted against the live
        // ref: the user just committed to a stated stake and payout, and a
        // sample-fresh divisor would quietly send a different count than the
        // card they were reading.
        params['size'] = normalizeContracts(predictionContracts)
        if (orderType === 'limit') {
          // Belt and braces behind the disabled slider: an out-of-range field
          // must never reach the venue as a clamped worst-case price.
          if (predictionLimitPrice === null) return
          params['type'] = 'limit'
          params['price'] = String(predictionLimitPrice)
        } else {
          params['type'] = 'market'
        }
      } else if (isDex) {
        if (!selectedWallet) return
        params['walletId'] = selectedWallet.id
        params['mode'] = 'live'

        if (orderType === 'limit') {
          // Resting DEX orders are denominated in the base token at the limit
          // price — the connector escrows the matching input leg.
          params['type'] = 'limit'
          params['price'] = limitPrice
          params['size'] =
            sizeCcy === 'quote'
              ? baseSizeAt(sizeNumber, toNumber(limitPrice))
              : amount
        } else {
          // A swap's size is the INPUT token: a buy spends the quote leg, a
          // sell spends the base leg.
          const price = live.last
          if (
            (side === 'buy' && sizeCcy === 'base') ||
            (side === 'sell' && sizeCcy === 'quote')
          ) {
            if (!price) throw new Error(t('mobile.trade.noPrice'))
          }
          params['type'] = 'market'
          params['slippageBps'] = slippageBps
          params['size'] =
            side === 'buy'
              ? sizeCcy === 'base'
                ? (sizeNumber * (price ?? 0)).toFixed(8)
                : amount
              : sizeCcy === 'quote'
                ? baseSizeAt(sizeNumber, price ?? 1)
                : amount
        }
      } else if (isPerp) {
        // Contracts, not base units, and no tgtCcy: ccxt's unified interface
        // takes a contract count for contract markets, and there is no second
        // leg to denominate the size in. Leverage rides per order (the
        // connector sets it on the symbol first, idempotently); reduce-only
        // only when asked for, so an opening order never carries it.
        if (!selectedCred) return
        params['credentialId'] = selectedCred.id
        params['size'] = amount
        // Leverage only on a deliberate choice, and never on a close: it is
        // account state at the venue, not an order field. The contract size is
        // the risk guard's hint and is sent only when the venue published one
        // — passed as 1 on an unknown it would overstate a 0.001 BTC contract
        // a thousandfold.
        if (leverageDirty && !reduceOnly) params['leverage'] = leverage
        if (contractSizeKnown) params['contractSize'] = contractSize
        if (reduceOnly) params['reduceOnly'] = true
        if (orderType === 'limit') {
          params['type'] = 'limit'
          params['price'] = limitPrice
        } else if (orderType === 'stop') {
          params['type'] = 'market'
          params['trigger'] = { triggerPrice: stopPrice, triggerType: 'sl' }
        } else {
          params['type'] = 'market'
        }
      } else {
        if (!selectedCred) return
        params['credentialId'] = selectedCred.id

        if (orderType === 'limit') {
          params['type'] = 'limit'
          params['price'] = limitPrice
          params['size'] =
            sizeCcy === 'quote'
              ? baseSizeAt(sizeNumber, toNumber(limitPrice))
              : amount
          if (extendedHours && extendedHoursEligible) {
            params['extendedHours'] = true
          }
        } else if (orderType === 'stop') {
          // A stop is a market order behind an exchange-native trigger. Venues
          // take the size in base units for trigger orders, so a quote-
          // denominated amount converts at the trigger price.
          params['type'] = 'market'
          params['trigger'] = { triggerPrice: stopPrice, triggerType: 'sl' }
          params['size'] =
            sizeCcy === 'quote'
              ? baseSizeAt(sizeNumber, toNumber(stopPrice))
              : amount
        } else {
          params['type'] = 'market'
          params['size'] = amount
          params['tgtCcy'] = sizeCcy === 'base' ? 'base_ccy' : 'quote_ccy'
        }
      }

      // The ONE exit. `placeOrder` is the attended, guarded path: vault seal,
      // order locks, maxPositionSize, idempotency key, trade counting and the
      // trade_* analytics all live behind it. `placeUnattendedOrder` is for
      // orders nobody is watching and must never be reachable from a ticket.
      const result = await placeOrder(params)

      if (!result.success) {
        // The one place the phone is allowed a long haptic. A rejection lands
        // as a toast at the top of a screen whose bottom half the user is
        // still looking at, and the venue can take a second to say no.
        haptic('error')
        toast.error(t('terminal.trade.orderRejected'), {
          description: result.error ?? t('common.unknownError'),
        })
        return
      }

      if (isDex && selectedWallet) {
        // A swap fills atomically and there is no exchange order stream to
        // echo it back, so the journal entry is written here.
        const fillPrice =
          orderType === 'limit' ? toNumber(limitPrice) : (live.last ?? 0)
        const orderSize = String(params['size'] ?? '0')
        const baseFill =
          orderType === 'limit'
            ? Number(orderSize)
            : side === 'buy' && fillPrice > 0
              ? Number(orderSize) / fillPrice
              : Number(orderSize)
        upsertOrderEvent({
          orderId: result.orderId ?? crypto.randomUUID(),
          market: focusedVenue,
          pair: focusedPair,
          side,
          type: orderType === 'limit' ? 'limit' : 'market',
          size: baseFill.toFixed(8),
          price: String(fillPrice),
          fillSize: orderType === 'limit' ? '0' : baseFill.toFixed(8),
          avgPrice: orderType === 'limit' ? '0' : String(fillPrice),
          mode: 'live',
          status: orderType === 'limit' ? 'live' : 'filled',
          fee: '0',
          feeCcy: '',
          ts: Date.now(),
        })
        refreshWalletBalances(focusedVenue, selectedWallet.id, focusedPair)
      }

      haptic('success')
      // The receipt states what was SENT, which on a prediction ticket is not
      // what was typed: the field holds dollars, the venue took contracts, and
      // a prediction pair key has no base leg to name (`splitPairAssets` on
      // `KXBTCD-26AUG15-T53` yields a date fragment).
      const filledAsset = isPrediction
        ? outcomeLabel || t('terminal.trade.contracts')
        : baseAsset
      toast.success(
        side === 'buy'
          ? t('terminal.trade.buyAsset', { asset: filledAsset })
          : t('terminal.trade.sellAsset', { asset: filledAsset }),
        {
          description: isPrediction
            ? `${predictionContracts} ${t('terminal.trade.contracts')} · ${venueLabel}`
            : `${amount} ${sizeAsset} · ${venueLabel}`,
        },
      )
      clearAmount()
    } catch (err) {
      haptic('error')
      toast.error(t('terminal.trade.orderFailed'), { description: String(err) })
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit,
    focusedVenue,
    focusedPair,
    side,
    isDex,
    isPrediction,
    isPerp,
    leverage,
    leverageDirty,
    reduceOnly,
    contractSize,
    contractSizeKnown,
    predictionLimitPrice,
    predictionContracts,
    outcomeLabel,
    usesWallet,
    selectedWallet,
    selectedCred,
    orderType,
    limitPrice,
    stopPrice,
    amount,
    sizeCcy,
    sizeNumber,
    slippageBps,
    placeOrder,
    refreshWalletBalances,
    clearAmount,
    baseAsset,
    sizeAsset,
    venueLabel,
    t,
  ])

  const openOrderbook = useCallback(
    () => pushOverlay({ kind: 'orderbook' }),
    [pushOverlay],
  )
  // The way back to the question this ticket is a leg of: every sibling
  // outcome, every price, the resolution criteria. Only when the venue
  // actually returned the event — a control that opens nothing is worse than
  // no control, so the card renders as a heading in the states where it did
  // not (loading, not found, a venue this build cannot reach).
  const openPredictionEvent = useCallback(() => {
    if (!predictionEvent) return
    track('mobile_prediction_surface_opened', {
      surface: 'event',
      source: 'trade_ticket',
    })
    pushOverlay({
      kind: 'predictionEvent',
      event: predictionEvent,
      venue: focusedVenue,
      venueLabel: predictionVenueLabel,
    })
  }, [focusedVenue, predictionEvent, predictionVenueLabel, pushOverlay])
  // A DEX signs with a chain wallet, a CEX or broker with an API key. Sending
  // the venue id for both is what used to drop a DEX user into the exchange
  // wizard, which has no wallet form behind it — the desktop gate makes the
  // same split with `?connectChain=` vs `?connect=`.
  const walletChain = marketInfo?.walletChain
  const openConnect = useCallback(
    () =>
      pushOverlay(
        walletChain != null
          ? { kind: 'connect', chain: walletChain }
          : { kind: 'connect', market: focusedVenue },
      ),
    [pushOverlay, focusedVenue, walletChain],
  )

  const submitHint =
    confirmMode === 'hold'
      ? isLiveOrder
        ? t('terminal.trade.holdToConfirmLive')
        : t('terminal.trade.holdToPlace')
      : isLiveOrder
        ? t('terminal.trade.clickToConfirmLive')
        : t('terminal.trade.clickToPlace')

  /**
   * What this ticket is about, and when it settles.
   *
   * Rendered OUTSIDE `ticket` on purpose, beside the order-book strip. The
   * connect gate blurs the ticket behind a card, and the question is not a
   * trading control: someone with no key can still read what the market is
   * asking, when it resolves and how it resolves, and can still open the whole
   * event. Same principle the order-book strip above it already follows.
   *
   * Renders nothing when neither the pin nor the venue can name the contract
   * (see `predictionIdentity`) — a bare ticker restated in a card would be a
   * heading with no content.
   */
  const questionCard =
    isPrediction && identity ? (
      <div className="flex flex-col gap-1 rounded-xl bg-[color:var(--pl-wash-strong)] px-3 py-2">
        {/* Tappable once the event is in hand: the ticket states one leg, and
            the sibling outcomes are the context that says whether this leg is
            the one worth taking. */}
        {predictionEvent ? (
          <button
            className="pl-press-soft -mx-1 flex items-start gap-2 rounded-lg px-1 text-left"
            onClick={openPredictionEvent}
            type="button"
            {...PRESS}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <PredictionQuestionLines identity={identity} />
            </span>
            <ChevronRight
              aria-hidden
              className="mt-[1px] size-3.5 shrink-0 text-muted-foreground"
            />
          </button>
        ) : (
          <PredictionQuestionLines identity={identity} />
        )}
        {/* Every other answer to the same question, one tap each. The pair
            is the question, so switching sides is a selection inside the
            ticket rather than a trip back to the chart to find another
            contract. */}
        <PredictionOutcomeStrip />
        {/* Collapsed by default, one row tall. It is what a probability is
            worth reading against, and this is the last surface before the
            money moves. */}
        <PredictionRules
          rules={identity.rules}
          venueLabel={identity.venueLabel}
        />
      </div>
    ) : null

  const ticket = (
    <div className="flex flex-col gap-2.5 px-4 pb-2 pt-1">
      {/* Buy / Sell */}
      <div className="flex gap-2">
        <SideButton
          active={side === 'buy'}
          label={t('terminal.trade.buy')}
          onPress={() => handleSide('buy')}
          side="buy"
        />
        <SideButton
          active={side === 'sell'}
          label={t('terminal.trade.sell')}
          onPress={() => handleSide('sell')}
          side="sell"
        />
      </div>

      {/* Order type */}
      <div className="flex gap-1 rounded-[11px] bg-[color:var(--pl-wash-strong)] p-[3px]">
        <SegmentButton
          active={orderType === 'limit'}
          disabled={!supportsLimit}
          label={t('terminal.trade.orderTypeLimit')}
          onPress={() => handleOrderType('limit')}
        />
        {!limitOnly && (
          <SegmentButton
            active={orderType === 'market'}
            label={t('terminal.trade.orderTypeMarket')}
            onPress={() => handleOrderType('market')}
          />
        )}
        {!isPrediction && (
          <SegmentButton
            active={orderType === 'stop'}
            disabled={!supportsStop}
            label={t('mobile.trade.orderTypeStop')}
            onPress={() => handleOrderType('stop')}
          />
        )}
      </div>

      {/* Fields */}
      {orderType !== 'market' ? (
        <NumericField
          accent
          label={
            orderType === 'limit'
              ? t('terminal.trade.orderTypeLimit')
              : t('mobile.trade.orderTypeStop')
          }
          locale={i18n.language}
          onChange={orderType === 'limit' ? setLimitPrice : setStopPrice}
          unit={<FieldUnit>{isPrediction ? '¢' : quoteAsset}</FieldUnit>}
          value={orderType === 'limit' ? limitPrice : stopPrice}
        />
      ) : null}

      {predictionPriceInvalid && (
        <p className="-mt-1 px-1 text-[11px] leading-snug text-destructive">
          {t('terminal.trade.priceCentsRange')}
        </p>
      )}

      {/* Leverage. Presets rather than a free field: the venue takes integers
          inside its own ceiling, and the row ends AT that ceiling so the top
          of the range is visible rather than implied. */}
      {isPerp && maxLeverage > 1 ? (
        <div className="flex gap-2">
          {leveragePresets(maxLeverage).map((lev) => (
            <button
              className={cn(
                'pl-press h-[31px] flex-1 rounded-[9px] border font-mono text-[12px] tabular-nums',
                leverage === lev
                  ? 'border-[color:var(--pl-edge-strong)] bg-[color:var(--pl-wash-heavy)] text-foreground'
                  : 'border-[color:var(--pl-edge)] text-muted-foreground',
              )}
              key={lev}
              onClick={() => {
                haptic('selection')
                setLeverage(lev)
                setLeverageDirty(true)
              }}
              type="button"
              {...PRESS}
            >
              {lev}x
            </button>
          ))}
        </div>
      ) : null}

      {/* Amount. A prediction ticket takes DOLLARS — traders decide in money,
          both venues settle in contracts — and states the conversion under the
          field rather than leaving it to be done in the head under a live
          quote. A perp still takes contracts: there its size IS the count. */}
      <NumericField
        label={
          isPerp ? t('terminal.trade.contracts') : t('terminal.trade.amount')
        }
        locale={i18n.language}
        onChange={setAmount}
        unit={
          isPrediction ? (
            <FieldUnit>{collateral.currency}</FieldUnit>
          ) : isPerp ? (
            <FieldUnit>{t('terminal.trade.contracts')}</FieldUnit>
          ) : (
            <button
              aria-label={t('mobile.trade.switchSizeCurrency')}
              className="pl-hit-44 pl-press-soft -my-2 rounded-md px-1 py-2"
              {...PRESS}
              onClick={(event) => {
                // The field is a <label>, so a click anywhere inside it focuses
                // the input — switching BTC to USDT would open the keyboard as a
                // side effect. Suppressing the label's default keeps the two
                // gestures separate.
                event.preventDefault()
                setSizeCcy(sizeCcy === 'base' ? 'quote' : 'base')
              }}
              type="button"
            >
              <FieldUnit>{sizeAsset}</FieldUnit>
            </button>
          )
        }
        value={amount}
      />

      {/* What the stake buys, floored to whole contracts — the number that goes
          on the wire. Stated before the gesture rather than discovered on the
          fill, and when the stake does not reach one contract it says so: the
          slider is disabled there and a silent dead control explains nothing. */}
      {isPrediction && sizeNumber > 0 ? (
        <p
          className={cn(
            '-mt-1 px-1 text-right text-[11px] leading-snug',
            predictionContracts >= 1
              ? 'text-muted-foreground'
              : 'text-destructive',
          )}
        >
          {predictionContracts >= 1
            ? t('terminal.trade.contractCount', {
                count: predictionContracts,
                formatted: predictionContracts.toLocaleString(i18n.language),
              })
            : t('mobile.trade.underOneContract')}
        </p>
      ) : null}

      {/* Stake presets, in collateral. Max is the whole balance, floored to
          cents so a chip can never ask for more than the account holds. */}
      {isPrediction ? (
        <div className="flex gap-2">
          {predictionPresets.map((preset) => (
            <StakeChip
              active={amount === String(preset)}
              key={preset}
              label={`$${preset}`}
              onPress={() => {
                haptic('selection')
                setAmount(String(preset))
              }}
            />
          ))}
          <StakeChip
            active={maxCollateral !== '' && amount === maxCollateral}
            disabled={maxCollateral === ''}
            label={t('mobile.trade.max')}
            onPress={() => {
              haptic('selection')
              setAmount(maxCollateral)
            }}
          />
        </div>
      ) : null}

      {/* Percent buttons. A share of a balance means nothing in contracts —
          on a prediction ticket, and on a perp, where a sell opens a short
          rather than spending a base balance. */}
      <div className={cn('flex gap-2', (isPrediction || isPerp) && 'hidden')}>
        {PERCENTS.map((pct) => (
          <button
            className="pl-press h-[31px] flex-1 rounded-[9px] border border-[color:var(--pl-edge)] font-mono text-[12px] tabular-nums text-muted-foreground"
            key={pct}
            onClick={() => handlePercent(pct)}
            type="button"
            {...PRESS}
          >
            {pct === 100 ? t('mobile.trade.max') : `${pct}%`}
          </button>
        ))}
      </div>

      {/* Extended hours — equities limit orders only. Fires the haptic from
          the gesture, not the state change, so the tap feels immediate. */}
      {extendedHoursEligible ? (
        <button
          aria-pressed={extendedHours}
          className={cn(
            'pl-press flex h-[31px] w-full items-center justify-between rounded-[9px] border px-2.5 text-[12px]',
            extendedHours
              ? 'border-[color:var(--pl-edge-strong)] bg-[color:var(--pl-wash-heavy)] text-foreground'
              : 'border-[color:var(--pl-edge)] text-muted-foreground',
          )}
          onClick={() => {
            haptic('selection')
            setExtendedHours(!extendedHours)
          }}
          type="button"
          {...PRESS}
        >
          <span>{t('terminal.trade.extendedHours')}</span>
          <span
            className={cn(
              'flex size-[15px] items-center justify-center rounded-[5px] border',
              extendedHours
                ? 'border-transparent bg-foreground text-background'
                : 'border-[color:var(--pl-edge-strong)]',
            )}
          >
            {extendedHours ? (
              <Check className="size-2.5" strokeWidth={3} />
            ) : null}
          </span>
        </button>
      ) : null}

      {/* Reduce-only. Same gesture-first haptic as the toggle above. The flag
          the venue reads to shrink a position and refuse to flip it. */}
      {isPerp ? (
        <button
          aria-pressed={reduceOnly}
          className={cn(
            'pl-press flex h-[31px] w-full items-center justify-between rounded-[9px] border px-2.5 text-[12px]',
            reduceOnly
              ? 'border-[color:var(--pl-edge-strong)] bg-[color:var(--pl-wash-heavy)] text-foreground'
              : 'border-[color:var(--pl-edge)] text-muted-foreground',
          )}
          onClick={() => {
            haptic('selection')
            setReduceOnly(!reduceOnly)
          }}
          type="button"
          {...PRESS}
        >
          <span>{t('terminal.trade.reduceOnly')}</span>
          <span
            className={cn(
              'flex size-[15px] items-center justify-center rounded-[5px] border',
              reduceOnly
                ? 'border-transparent bg-foreground text-background'
                : 'border-[color:var(--pl-edge-strong)]',
            )}
          >
            {reduceOnly ? <Check className="size-2.5" strokeWidth={3} /> : null}
          </span>
        </button>
      ) : null}

      {/* Summary */}
      <div className="flex flex-col gap-1 pt-0.5">
        {isPerp ? (
          <>
            {perpBaseEquivalent !== null && (
              <SummaryRow
                label={t('mobile.trade.baseEquivalent')}
                value={`${formatAmount(perpBaseEquivalent)} ${baseAsset}`}
              />
            )}
            <SummaryRow
              label={t('terminal.trade.notional')}
              value={
                perpNotionalValue == null
                  ? '—'
                  : `${perpNotionalValue.toFixed(2)} ${quoteAsset}`
              }
            />
            <SummaryRow
              label={t('terminal.trade.estLiquidation')}
              value={
                perpLiquidation == null ? '—' : formatPrice(perpLiquidation)
              }
            />
          </>
        ) : isPrediction ? (
          <>
            {/* The price the stake was divided by, and the worst case. Both
                read the same `predictionPayout` as the card below, so the rows,
                the card and the size on the wire cannot drift apart. A dash
                rather than a stale figure when the price is unusable: the last
                valid one would read as this order's.

                No max-payout row, unlike the desktop ticket: the card's hero
                figure IS the max payout, in the same colour and 30px lower, and
                a phone cannot spend a line restating a number already on
                screen — the confirm slider is what the height buys. */}
            <SummaryRow
              label={t('terminal.trade.avgFillPrice')}
              value={
                predictionPrice === null
                  ? '—'
                  : formatPredictionPrice(predictionPrice)
              }
            />
            <SummaryRow
              label={t('terminal.trade.maxLoss')}
              tone="down"
              value={payout === null ? '—' : formatCollateral(payout.stake)}
            />
          </>
        ) : (
          <SummaryRow
            label={t('mobile.trade.orderValue')}
            value={
              orderValue == null
                ? '—'
                : `${orderValue.toLocaleString(i18n.language, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} ${quoteAsset}`
            }
          />
        )}
        <SummaryRow
          label={t('mobile.trade.available')}
          value={
            isPrediction
              ? `${formatAvailable(collateral.total)} ${collateral.currency}`
              : isPerp
                ? // Margin, not a base balance: a perp position is collateral
                  // in the settle currency, and the base asset is never held.
                  `${formatAvailable(availableQuote)} ${quoteAsset}`
                : `${formatAvailable(
                    side === 'sell' ? availableBase : availableQuote,
                  )} ${side === 'sell' ? baseAsset : quoteAsset}`
          }
        />
        <TradeRiskRow
          contractSize={isPerp && contractSizeKnown ? contractSize : undefined}
          // The venue-scoped key, not the bare id: a futures connector records
          // its margin balances under its own namespace, and measured against
          // the bare id a futures-only account reads as a portfolio of zero.
          credentialId={usesWallet ? undefined : balanceScope}
          onBlocksChange={setRiskBlocks}
          pairKey={focusedPair}
          price={referencePrice}
          // A prediction size is a contract COUNT (the guard prices a contract
          // at its probability, capped at $1), never the dollars in the field:
          // handing it the stake would measure a $100 order as 100 contracts.
          quoteDenominated={isPrediction ? false : sizeCcy === 'quote'}
          side={side}
          size={isPrediction ? predictionContracts : sizeNumber}
        />
      </div>

      {/* What the order returns if it is right, immediately above the gesture
          that commits it. A bought contract risks the premium, a sold one the
          rest of the dollar it may owe, and both return the whole dollar. */}
      {isPrediction && payout !== null ? (
        <TradePayoutCard
          outcome={outcomeLabel || t('terminal.trade.thisOutcome')}
          payout={payout}
          side={side}
        />
      ) : null}

      <TradeSlideConfirm
        busy={submitting}
        busyLabel={t('terminal.trade.submitting')}
        disabled={!canSubmit}
        hint={submitHint}
        holdMs={tradeHoldMs(isLiveOrder)}
        label={
          side === 'buy'
            ? t('mobile.trade.slideToBuy', { venue: venueLabel })
            : t('mobile.trade.slideToSell', { venue: venueLabel })
        }
        onConfirm={handleSubmit}
        side={side}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-3 pt-1">
      <LivePriceProbe onSample={setPrices} target={pricesRef} />

      {/* Sharp in both states: nothing about the market is hidden from someone
          who has no key — only the part that needs one. The prediction question
          card sits here for the same reason. */}
      <div className="flex flex-col gap-2.5 px-4">
        <TradeOrderbookStrip onOpen={openOrderbook} />
        {questionCard}
      </div>

      {needsConnect ? (
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none select-none opacity-[.42] blur-[4px]"
            inert
          >
            {ticket}
          </div>
          <ConnectCard
            isDex={isDex}
            market={focusedVenue}
            onConnect={openConnect}
            readOnly={!marketInfo?.capabilities.includes('trade')}
            venueLabel={venueLabel}
          />
        </div>
      ) : (
        ticket
      )}
    </div>
  )
})

// ── Pieces ────────────────────────────────────────────────────────────

function SideButton({
  side,
  active,
  label,
  onPress,
}: {
  side: 'buy' | 'sell'
  active: boolean
  label: string
  onPress: () => void
}) {
  const token = side === 'buy' ? '--up' : '--down'
  return (
    <button
      className={cn(
        // Inline styles carry the active side's fill and ring, so `.pl-press`'s
        // own box-shadow never lands on it — the squeeze is the whole press
        // here, and it is enough on a 42px control.
        'pl-press h-[42px] flex-1 rounded-xl text-[15.5px] font-semibold',
        active
          ? side === 'buy'
            ? 'text-up'
            : 'text-down'
          : 'border border-[color:var(--pl-edge)] text-muted-foreground',
      )}
      onClick={onPress}
      {...PRESS}
      style={
        active
          ? {
              backgroundColor: `color-mix(in oklch, var(${token}) 20%, transparent)`,
              boxShadow: `inset 0 0 0 1.5px color-mix(in oklch, var(${token}) 55%, transparent)`,
            }
          : undefined
      }
      type="button"
    >
      {label}
    </button>
  )
}

function SegmentButton({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean
  disabled?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <button
      className={cn(
        'pl-press h-7 flex-1 rounded-lg text-[12.5px] font-medium',
        active
          ? 'bg-[color:var(--pl-wash-heavy)] text-foreground'
          : 'text-muted-foreground',
        disabled && 'opacity-35',
      )}
      disabled={disabled}
      onClick={onPress}
      type="button"
      {...PRESS}
    >
      {label}
    </button>
  )
}

/**
 * The two lines the question card is made of, so the tappable and the
 * non-tappable card cannot drift into printing different things.
 */
function PredictionQuestionLines({
  identity,
}: {
  identity: PredictionIdentity
}) {
  const { t } = useTranslation()
  return (
    <>
      {identity.question !== '' ? (
        <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-foreground">
          {identity.question}
        </p>
      ) : null}
      {identity.resolvesAt !== undefined ? (
        <span className="text-[11px] leading-none text-muted-foreground">
          {t('terminal.trade.resolvesOn', {
            date: formatResolutionDate(identity.resolvesAt),
          })}
        </span>
      ) : null}
    </>
  )
}

function FieldUnit({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[12px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function NumericField({
  label,
  value,
  onChange,
  unit,
  accent = false,
  locale,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  unit?: ReactNode
  /** The limit price is drawn in the primary colour, as on the chart. */
  accent?: boolean
  locale: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <label className="pl-field flex items-center gap-3 rounded-xl px-[13px] py-[11px]">
      <span className="shrink-0 text-[12.5px] text-muted-foreground">
        {label}
      </span>
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent text-right font-mono text-[18px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50',
          accent ? 'text-primary' : 'text-foreground',
        )}
        inputMode="decimal"
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        onFocus={() => setFocused(true)}
        placeholder="0"
        type="text"
        value={focused ? value : formatFieldValue(value, locale)}
      />
      {unit}
    </label>
  )
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  /**
   * Colours the figure where the figure IS a direction: what an order can win
   * against what it can lose. A dash keeps the neutral colour — an absent
   * number is not good news.
   */
  tone?: 'up' | 'down'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-normal">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono tabular-nums',
          value === '—' || tone === undefined
            ? 'text-foreground'
            : tone === 'up'
              ? 'text-up'
              : 'text-down',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * A stake preset, in collateral. Same 31px row geometry as the percent chips it
 * replaces on a prediction ticket, with the selected one carrying the primary
 * tint so the last tap is visible after the keyboard closes over the field.
 */
function StakeChip({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean
  disabled?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <button
      className={cn(
        'pl-press h-[31px] flex-1 rounded-[9px] border font-mono text-[12px] tabular-nums',
        active
          ? 'border-primary text-foreground'
          : 'border-[color:var(--pl-edge)] text-muted-foreground',
        disabled && 'opacity-35',
      )}
      disabled={disabled}
      onClick={onPress}
      style={
        active
          ? {
              backgroundColor:
                'color-mix(in oklch, var(--primary) 14%, transparent)',
            }
          : undefined
      }
      type="button"
      {...PRESS}
    >
      {label}
    </button>
  )
}

/**
 * Design screen 9. The copy is the desktop connect gate's, and the intent is
 * the same `/accounts?connect=<market>` / `?connectChain=<chain>` one — but on
 * a phone the wizard is an overlay pushed onto the mobile stack rather than a
 * route, so the user comes back to the ticket they were standing on.
 *
 * A DEX asks for a wallet, not an account: same split as
 * `trade-connect-gate.tsx`, so the card's promise matches the form it opens.
 */
function ConnectCard({
  market,
  venueLabel,
  isDex,
  readOnly,
  onConnect,
}: {
  market: string
  /** Venue name, or the CHAIN name for a DEX venue. */
  venueLabel: string
  isDex: boolean
  readOnly: boolean
  onConnect: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="flex w-full flex-col items-center gap-[13px] rounded-[18px] bg-[color:var(--pl-surface-overlay)] px-5 pb-[18px] pt-[22px] text-center shadow-[var(--pl-shadow-popover)]">
        <PluginBrandTile
          id={venuePluginId(market)}
          name={venueLabel}
          size={52}
          src={venuePosterSrc(market)}
        />
        <p className="text-[16px] font-semibold leading-[1.35] text-foreground">
          {readOnly
            ? t('terminal.wallet.gateNoTrading')
            : isDex
              ? t('terminal.wallet.connectHintWallet', { chain: venueLabel })
              : t('terminal.wallet.connectHintAccount', { venue: venueLabel })}
        </p>
        {!readOnly ? (
          <>
            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
              {/* The default body names an API key, which a DEX never asks
                  for — the Accounts page's own wallet line is the accurate
                  sentence and already ships in every locale. */}
              {isDex
                ? t('accounts.noCryptoWalletsDesc')
                : t('mobile.trade.connectBody')}
            </p>
            <button
              className="pl-press flex h-[46px] w-full items-center justify-center gap-2 rounded-[13px] bg-primary text-[15px] font-semibold text-primary-foreground"
              onClick={onConnect}
              type="button"
              {...PRESS}
            >
              {isDex ? (
                <Wallet aria-hidden className="size-4" />
              ) : (
                <KeyRound aria-hidden className="size-4" />
              )}
              {isDex
                ? t('terminal.wallet.connectWallet')
                : t('terminal.wallet.connectAccount')}
            </button>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock aria-hidden className="size-3" />
              {t('accounts.storedSecurely')}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
