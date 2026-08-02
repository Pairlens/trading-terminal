// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { useDisplayCurrency } from './use-display-currency'
import { useMarketData } from '@/lib/market-data-provider'
import { getBalances, subscribeBalances } from '@/stores/balances-store'

// USD-pegged stablecoins: 1 unit ≈ 1 USDT
const USD_PEGGED = new Set([
  'USDT',
  'USDC',
  'DAI',
  'BUSD',
  'TUSD',
  'USDD',
  'USD',
])

// Fiat currencies: use USDT-{fiat} to get the rate, then invert
const FIAT_CURRENCIES = new Set(['EUR', 'GBP'])

export type HoldingValue = {
  currency: string
  amount: number
  price: number | null
  value: number | null
  color: string
}

// Resolve CSS chart colors from the theme (--chart-1 through --chart-5).
// Falls back to hardcoded values for SSR / non-browser contexts.
const CHART_VAR_COUNT = 5

function getChartColors(): Array<string> {
  if (typeof document === 'undefined') {
    return ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444']
  }
  const style = getComputedStyle(document.documentElement)
  const colors: Array<string> = []
  for (let i = 1; i <= CHART_VAR_COUNT; i++) {
    const raw = style.getPropertyValue(`--chart-${i}`).trim()
    colors.push(raw || `var(--chart-${i})`)
  }
  return colors
}

// No caching — resolved on each render so theme changes take effect immediately
const getColors = getChartColors

/**
 * Subscribes to WS tickers for each held asset to compute real-time
 * portfolio value in the user's display currency.
 *
 * Strategy: price everything in USDT via WS ticker subscriptions,
 * then apply a single USDT→displayCurrency FX rate.
 *
 * Subscriptions are managed incrementally via a ref — new currencies
 * get subscribed, removed currencies get unsubscribed. No cleanup
 * on re-render to avoid subscribe/unsubscribe loops.
 */
export function usePortfolioValue(credentialId?: string) {
  const { subscribeTicker } = useMarketData()
  const { currency: displayCurrency, symbol: currencySymbol } =
    useDisplayCurrency()
  const allBalances = useSyncExternalStore(subscribeBalances, getBalances)
  const balances = useMemo(
    () =>
      credentialId
        ? allBalances.filter((b) => b.credentialId === credentialId)
        : allBalances,
    [allBalances, credentialId],
  )

  const pricesRef = useRef(new Map<string, number>())
  const [, setVersion] = useState(0)
  const fxRateRef = useRef(displayCurrency === 'USD' ? 1 : 0)
  const unsubsRef = useRef(new Map<string, () => void>())

  const bump = () => setVersion((v) => v + 1)

  // ── WS ticker subscriptions (real-time) ──
  useEffect(() => {
    const unsubs = unsubsRef.current
    const held = new Set(balances.map((b) => b.currency))
    const market = balances[0]?.market ?? 'okx'

    // Unsubscribe removed assets
    for (const [key, unsub] of unsubs) {
      if (key === '__fx__') continue
      if (!held.has(key)) {
        unsub()
        unsubs.delete(key)
        pricesRef.current.delete(key)
      }
    }

    for (const bal of balances) {
      const ccy = bal.currency
      if (USD_PEGGED.has(ccy)) {
        pricesRef.current.set(ccy, 1)
        continue
      }
      if (unsubs.has(ccy)) continue

      const pair = FIAT_CURRENCIES.has(ccy) ? `USDT-${ccy}` : `${ccy}-USDT`
      const isFiat = FIAT_CURRENCIES.has(ccy)

      const unsub = subscribeTicker(market, pair, (data) => {
        const px = (data as { ticker?: { last: number } })?.ticker?.last
        if (px && px > 0) {
          pricesRef.current.set(ccy, isFiat ? 1 / px : px)
          bump()
        }
      })
      unsubs.set(ccy, unsub)
    }

    // Bump to render USD-pegged prices on first mount
    bump()
  }, [balances, subscribeTicker])

  // Full teardown on unmount only
  useEffect(() => {
    return () => {
      for (const [, unsub] of unsubsRef.current) unsub()
      unsubsRef.current.clear()
    }
  }, [])

  // FX rate subscription for non-USD display currencies
  useEffect(() => {
    const unsubs = unsubsRef.current
    const prev = unsubs.get('__fx__')
    if (prev) {
      prev()
      unsubs.delete('__fx__')
    }
    if (displayCurrency === 'USD') {
      fxRateRef.current = 1
      bump()
      return
    }
    const market = balances[0]?.market ?? 'okx'
    const unsub = subscribeTicker(market, `USDT-${displayCurrency}`, (data) => {
      const px = (data as { ticker?: { last: number } })?.ticker?.last
      if (px && px > 0) {
        fxRateRef.current = px
        bump()
      }
    })
    unsubs.set('__fx__', unsub)
  }, [displayCurrency, balances, subscribeTicker])

  // Compute holdings
  const effectiveRate = fxRateRef.current || 1
  const holdings: Array<HoldingValue> = balances.map((bal, i) => {
    const amount = Number(bal.total)
    const usdtPrice = pricesRef.current.get(bal.currency) ?? null
    const price = usdtPrice != null ? usdtPrice * effectiveRate : null
    return {
      currency: bal.currency,
      amount,
      price,
      value: price != null ? amount * price : null,
      color: getColors()[i % CHART_VAR_COUNT],
    }
  })

  const totalValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0)
  const hasAllPrices = holdings.every((h) => h.value != null)

  // Pre-FX USD total + the per-currency USD price map, for currency-invariant
  // risk math (e.g. maxPositionSize as a % of portfolio).
  const totalValueUsd = balances.reduce(
    (sum, b) =>
      sum + Number(b.total) * (pricesRef.current.get(b.currency) ?? 0),
    0,
  )
  const priceUsd = new Map(pricesRef.current)

  return {
    holdings,
    totalValue,
    totalValueUsd,
    priceUsd,
    hasAllPrices,
    displayCurrency,
    currencySymbol,
  }
}
