// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mobile order ticket's draft, outside React.
 *
 * This store is the reason the Trade sheet may unmount freely. On the desktop
 * the ticket's state is component-local, so a panel that closes loses whatever
 * was typed into it; on the phone the panel closes every time the user taps the
 * chart, which is the app's primary gesture. Lifting the draft here makes
 * "dismiss and come back" free — and it is also what lets the chart's draggable
 * limit line and the Limit field be the same number rather than two numbers
 * kept in sync.
 *
 * It deliberately holds ONLY the draft. No submission logic, no credential
 * resolution, no risk verdict: `placeOrder` (the attended, guarded path in
 * `market-data-provider`) stays the single exit, and a store method that could
 * place an order would be a second one.
 *
 * `sizeCcy` mirrors the desktop ticket's `pairlens:trade:sizeCcy` key in the
 * same JSON format `usePersistedState` writes, because a user's size currency
 * must not depend on the width of their window. It is read once at module
 * init and written on change; the cross-instance broadcast that
 * `usePersistedState` performs is not needed here, since the desktop ticket
 * never renders at mobile width and vice versa.
 */
import { create } from 'zustand'

import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

export type OrderSide = 'buy' | 'sell'

/**
 * The three segments of the design's order-type control.
 *
 * `stop` places a market order behind an exchange-native trigger — only on
 * venues that advertise `triggerOrders`; the panel disables the segment
 * elsewhere rather than pretending.
 */
export type MobileOrderType = 'limit' | 'market' | 'stop'

export type SizeCurrency = 'base' | 'quote'

const SIZE_CCY_KEY = `${STORAGE_PREFIX}trade:sizeCcy`

function readSizeCcy(): SizeCurrency {
  if (typeof window === 'undefined') return 'quote'
  try {
    const raw = localStorage.getItem(SIZE_CCY_KEY)
    if (raw === null) return 'quote'
    const parsed = JSON.parse(raw) as unknown
    return parsed === 'base' ? 'base' : 'quote'
  } catch {
    return 'quote'
  }
}

function writeSizeCcy(value: SizeCurrency): void {
  try {
    localStorage.setItem(SIZE_CCY_KEY, JSON.stringify(value))
  } catch {
    // Quota or private browsing — the draft still works, it just won't stick.
  }
}

export type OrderDraftState = {
  /** The (venue, pair) the numeric fields belong to. */
  market: string
  pairKey: string
  side: OrderSide
  orderType: MobileOrderType
  /** Raw, parseable strings — never locale-formatted. The field formats. */
  limitPrice: string
  stopPrice: string
  amount: string
  sizeCcy: SizeCurrency
  /**
   * The ticket has been opened at least once this session. The chart's limit
   * line reads it: a line drawn over a chart the user has never traded from
   * would be an unexplained artifact.
   */
  ticketOpened: boolean

  setSide: (side: OrderSide) => void
  setOrderType: (orderType: MobileOrderType) => void
  setLimitPrice: (price: string) => void
  setStopPrice: (price: string) => void
  setAmount: (amount: string) => void
  setSizeCcy: (sizeCcy: SizeCurrency) => void
  /**
   * Point the draft at a (venue, pair).
   *
   * Changing the PAIR clears the numbers: 0.18 of one asset is not 0.18 of
   * another, and a BTC limit price on a SOL chart is a mis-click waiting to
   * happen. Changing only the venue keeps them — it is the same instrument at
   * very nearly the same price, and re-typing an amount to move venue would be
   * the annoying half of that safety.
   */
  focusMarket: (market: string, pairKey: string) => void
  markTicketOpened: () => void
  /** After a placed order: the size is spent, the price preference is not. */
  clearAmount: () => void
  reset: () => void
}

const initial = {
  market: '',
  pairKey: '',
  side: 'buy' as OrderSide,
  orderType: 'limit' as MobileOrderType,
  limitPrice: '',
  stopPrice: '',
  amount: '',
  ticketOpened: false,
}

export const useOrderDraftStore = create<OrderDraftState>()((set) => ({
  ...initial,
  sizeCcy: readSizeCcy(),

  setSide: (side) => set({ side }),
  setOrderType: (orderType) => set({ orderType }),
  setLimitPrice: (limitPrice) => set({ limitPrice }),
  setStopPrice: (stopPrice) => set({ stopPrice }),
  setAmount: (amount) => set({ amount }),
  setSizeCcy: (sizeCcy) => {
    writeSizeCcy(sizeCcy)
    set({ sizeCcy })
  },

  focusMarket: (market, pairKey) =>
    set((state) => {
      if (state.market === market && state.pairKey === pairKey) return state
      if (state.pairKey === pairKey) return { ...state, market }
      return {
        ...state,
        market,
        pairKey,
        limitPrice: '',
        stopPrice: '',
        amount: '',
      }
    }),

  markTicketOpened: () =>
    set((state) =>
      state.ticketOpened ? state : { ...state, ticketOpened: true },
    ),

  clearAmount: () => set({ amount: '' }),

  reset: () => set({ ...initial, sizeCcy: readSizeCcy() }),
}))

/** The price field that matters for the current order type, as a number. */
export function draftPrice(state: OrderDraftState): number | null {
  const raw =
    state.orderType === 'limit'
      ? state.limitPrice
      : state.orderType === 'stop'
        ? state.stopPrice
        : ''
  const value = Number(raw)
  return raw !== '' && Number.isFinite(value) && value > 0 ? value : null
}
