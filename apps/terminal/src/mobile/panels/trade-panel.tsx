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
 * row, the credential and wallet stores, and the same `trade:*` persisted
 * preferences the desktop ticket writes.
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
import { Check, KeyRound, Lock, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useOrderDraftStore } from '../lib/order-draft-store'
import { PRESS } from '../primitives/press'
import { TradeOrderbookStrip } from './trade-orderbook-strip'
import { TradeRiskRow } from './trade-risk-row'
import { TradeSlideConfirm } from './trade-slide-confirm'
import type { MobileOrderType } from '../lib/order-draft-store'
import type { ReactNode, RefObject } from 'react'
import { haptic } from '@/lib/haptics'
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
  const balances = useSyncExternalStore(subscribeBalances, getBalances)
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

  const baseAsset = focusedPair.split('-')[0] ?? focusedPair
  const quoteAsset = focusedPair.split('-')[1] ?? 'USDT'
  const sizeAsset = sizeCcy === 'base' ? baseAsset : quoteAsset

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
  const isDex = marketInfo?.walletChain != null
  const venueLabel =
    marketInfo?.walletChain != null
      ? CHAIN_NAME[marketInfo.walletChain]
      : (CREDENTIAL_SCHEMAS[focusedVenue]?.label ??
        marketInfo?.displayName ??
        focusedVenue.toUpperCase())

  const marketCreds = useMemo(
    () => credentials.filter((c) => c.market === focusedVenue),
    [credentials, focusedVenue],
  )
  const chainWallets = useMemo(
    () =>
      isDex ? wallets.filter((w) => w.chain === marketInfo?.walletChain) : [],
    [isDex, wallets, marketInfo?.walletChain],
  )

  // The phone has no account switcher in the ticket: it trades from the
  // account the terminal already considers active, or from the venue's only
  // one. A venue with several accounts and none active picks the first —
  // choosing is a Settings › Accounts job, not a decision to block a trade on.
  const selectedCred = isDex
    ? undefined
    : (marketCreds.find((c) => c.id === activeWallet?.walletId) ??
      marketCreds[0])
  const selectedWallet = isDex
    ? (chainWallets.find((w) => w.id === activeWallet?.walletId) ??
      chainWallets[0])
    : undefined

  // Mirrors the desktop ticket's gate exactly: no key for the venue, no wallet
  // for the chain, or a connector that only streams prices. A SEALED vault is
  // excluded on purpose — the store is empty because it could not be read.
  const needsConnect =
    marketInfo != null &&
    !(isDex ? walletsSealed : credentialsSealed) &&
    (isDex ? walletsLoaded : credentialsLoaded) &&
    (!marketInfo.capabilities.includes('trade') ||
      (isDex ? chainWallets.length === 0 : marketCreds.length === 0))

  // Published for the chart's limit line: the draggable level only renders on
  // a ticket that can actually place an order (user-reported — the line was
  // floating over the ConnectCard). Live on purpose: connecting flips it on,
  // switching to an unconnected venue flips it off.
  useEffect(() => {
    setTradeReady(!needsConnect)
  }, [needsConnect, setTradeReady])

  const balanceScope = isDex
    ? selectedWallet
      ? dexBalanceCredentialKey(selectedWallet.id, focusedVenue)
      : undefined
    : selectedCred?.id
  const availableBase = useBalance(baseAsset, balanceScope)
  const availableQuote = useBalance(quoteAsset, balanceScope)

  // ── Order-type availability ──
  const supportsLimit = !isDex || marketInfo?.dexLimitOrders === true
  const supportsStop = !isDex && marketInfo?.triggerOrders === true

  useEffect(() => {
    if (orderType === 'limit' && !supportsLimit) setOrderType('market')
    if (orderType === 'stop' && !supportsStop) setOrderType('market')
  }, [orderType, supportsLimit, supportsStop, setOrderType])

  // ── Extended hours (equities) ──
  // Stocks trade on a session clock; outside it a limit order queues for the
  // next open unless it is explicitly routed to the pre-market/after-hours
  // book. Local state, never persisted: those sessions are thin enough that
  // the choice should be made per order, not inherited from last night.
  const isEquities = marketInfo?.assetClasses?.includes('stocks') === true
  const [extendedHours, setExtendedHours] = useState(false)
  const extendedHoursEligible = isEquities && orderType === 'limit'
  useEffect(() => {
    if (!extendedHoursEligible && extendedHours) setExtendedHours(false)
  }, [extendedHoursEligible, extendedHours])

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
      const seeded = String(Number(reference.toPrecision(8)))
      if (next === 'limit') {
        if (limitPrice === '') setLimitPrice(seeded)
      } else if (stopPrice === '') {
        setStopPrice(seeded)
      }
    },
    [focusedPair, side, limitPrice, stopPrice, setLimitPrice, setStopPrice],
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
  const referencePrice =
    orderType === 'market' ? (prices.last ?? null) : typedPrice || null
  const sizeNumber = toNumber(amount)
  const orderValue =
    sizeCcy === 'quote'
      ? sizeNumber
      : referencePrice != null
        ? sizeNumber * referencePrice
        : null

  // The risk verdict is computed inside `TradeRiskRow`, not here: the hook
  // behind it subscribes a ticker per held asset and re-renders on each tick,
  // which in this fiber would wake the whole ticket at socket rate and undo
  // `LivePriceProbe`. Only the one bit the submit gate needs comes back up,
  // and only when it changes.
  const [riskBlocks, setRiskBlocks] = useState(false)

  const isLiveOrder = isDex || selectedCred?.mode === 'live'
  const canSubmit =
    !needsConnect &&
    (isDex ? selectedWallet != null : selectedCred != null) &&
    mdStatus === 'connected' &&
    !submitting &&
    sizeNumber > 0 &&
    (orderType === 'market' || typedPrice > 0) &&
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

      if (isDex) {
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
      toast.success(
        side === 'buy'
          ? t('terminal.trade.buyAsset', { asset: baseAsset })
          : t('terminal.trade.sellAsset', { asset: baseAsset }),
        { description: `${amount} ${sizeAsset} · ${venueLabel}` },
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
        <SegmentButton
          active={orderType === 'market'}
          label={t('terminal.trade.orderTypeMarket')}
          onPress={() => handleOrderType('market')}
        />
        <SegmentButton
          active={orderType === 'stop'}
          disabled={!supportsStop}
          label={t('mobile.trade.orderTypeStop')}
          onPress={() => handleOrderType('stop')}
        />
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
          unit={<FieldUnit>{quoteAsset}</FieldUnit>}
          value={orderType === 'limit' ? limitPrice : stopPrice}
        />
      ) : null}

      <NumericField
        label={t('terminal.trade.amount')}
        locale={i18n.language}
        onChange={setAmount}
        unit={
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
        }
        value={amount}
      />

      {/* Percent buttons */}
      <div className="flex gap-2">
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

      {/* Summary */}
      <div className="flex flex-col gap-1 pt-0.5">
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
        <SummaryRow
          label={t('mobile.trade.available')}
          value={`${formatAvailable(
            side === 'sell' ? availableBase : availableQuote,
          )} ${side === 'sell' ? baseAsset : quoteAsset}`}
        />
        <TradeRiskRow
          credentialId={selectedCred?.id}
          onBlocksChange={setRiskBlocks}
          pairKey={focusedPair}
          price={referencePrice}
          quoteDenominated={sizeCcy === 'quote'}
          side={side}
          size={sizeNumber}
        />
      </div>

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
          who has no key — only the part that needs one. */}
      <div className="px-4">
        <TradeOrderbookStrip onOpen={openOrderbook} />
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-normal">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
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
