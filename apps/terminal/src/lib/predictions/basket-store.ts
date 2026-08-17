// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The outcomes staged for a multi-leg stake, and nothing else.
 *
 * A basket belongs to ONE event: the whole point of it is that the legs are
 * mutually exclusive, which is what makes "covers 59% of the field" and "at
 * most one of these pays" true sentences. Staging a leg from a different event
 * replaces the basket rather than appending to it, because a basket spanning
 * two questions has no overround, no coverage and no bounded best case — every
 * number the ticket prints would be wrong.
 *
 * Three things this store deliberately does NOT hold:
 *
 *  - Prices. The ladder and the ticket read the same events query, so the
 *    ticket prices its legs live. A price captured at add time would sit in an
 *    order ticket going stale, and a stale probability is a worse fill.
 *  - Contract counts. The user stakes dollars; contracts are derived at submit
 *    from the live price, which is the only place the conversion is honest.
 *  - localStorage. A basket is an unsent order. Restoring one a day later,
 *    against prices that have moved and a market that may have resolved, is
 *    not a convenience.
 */
import { create } from 'zustand'

/** Legs one basket may hold. Past this the ticket is a script, not a ticket. */
export const MAX_BASKET_LEGS = 12

export type BasketLeg = {
  /** Route-safe outcome key — what the order addresses. */
  pairKey: string
  /** Venue market id the order goes to. */
  market: string
  /** Runner label, for the row and the toast. */
  label: string
  /** Dollars the user wants to put on this leg, as typed. */
  stake: string
}

type BasketStore = {
  /** `venue:eventId` — the one event this basket belongs to. */
  eventKey: string | null
  legs: Array<BasketLeg>
  /** Stage a leg, replacing the basket when it belongs to another event. */
  add: (eventKey: string, leg: BasketLeg) => void
  remove: (pairKey: string) => void
  setStake: (pairKey: string, stake: string) => void
  clear: () => void
}

export const useBasketStore = create<BasketStore>((set) => ({
  eventKey: null,
  legs: [],

  add: (eventKey, leg) =>
    set((s) => {
      if (s.eventKey !== eventKey) return { eventKey, legs: [leg] }
      if (s.legs.some((l) => l.pairKey === leg.pairKey)) return s
      if (s.legs.length >= MAX_BASKET_LEGS) return s
      return { eventKey, legs: [...s.legs, leg] }
    }),

  remove: (pairKey) =>
    set((s) => {
      const legs = s.legs.filter((l) => l.pairKey !== pairKey)
      if (legs.length === s.legs.length) return s
      // An empty basket forgets its event, so the next staged leg starts
      // clean rather than inheriting a question nobody is looking at.
      return legs.length === 0
        ? { eventKey: null, legs }
        : { eventKey: s.eventKey, legs }
    }),

  setStake: (pairKey, stake) =>
    set((s) => ({
      eventKey: s.eventKey,
      legs: s.legs.map((l) => (l.pairKey === pairKey ? { ...l, stake } : l)),
    })),

  clear: () => set({ eventKey: null, legs: [] }),
}))

/** Stage a leg from outside React (the ladder's row button). */
export function stageBasketLeg(eventKey: string, leg: BasketLeg): void {
  useBasketStore.getState().add(eventKey, leg)
}

/** `venue:eventId`, the only key a basket is ever scoped by. */
export function basketEventKey(market: string, eventId: string): string {
  return `${market}:${eventId}`
}

export type BasketMath = {
  /** What the legs cost together, in dollars. */
  totalStake: number
  /** Contracts each leg buys at its live price, keyed by pair key. */
  contracts: Record<string, number>
  /** The largest single payout, since at most one leg can win. */
  bestPayout: number
  /** Best case minus what the whole basket cost. */
  bestProfit: number
  /** Sum of the staked outcomes' probabilities: how much of the field this covers. */
  coverage: number
  /** Legs that cannot be priced or sized — the submit gate reads this. */
  unusable: Array<string>
}

/**
 * What the basket costs and what it can pay.
 *
 * Two properties a trader has to be able to trust before staking:
 *
 *  - Max loss is the total stake. Every leg is a buy, so the worst case is
 *    that none of them resolves true and all the premium is gone.
 *  - Max payout is the LARGEST leg's payout, not their sum. The legs are
 *    mutually exclusive; summing them would advertise a return that cannot
 *    happen and is the single most dangerous number this pane could print.
 *
 * Contracts are floored, never rounded: a venue counts whole contracts, and
 * rounding up spends more than the user typed.
 */
export function basketMath(
  legs: Array<BasketLeg>,
  priceOf: (pairKey: string) => number | null,
): BasketMath {
  let totalStake = 0
  let bestPayout = 0
  let coverage = 0
  const contracts: Record<string, number> = {}
  const unusable: Array<string> = []

  for (const leg of legs) {
    const price = priceOf(leg.pairKey)
    const stake = Number(leg.stake)
    if (
      price === null ||
      !Number.isFinite(stake) ||
      stake <= 0 ||
      price <= 0 ||
      price >= 1
    ) {
      unusable.push(leg.pairKey)
      continue
    }
    const count = Math.floor(stake / price)
    if (count < 1) {
      unusable.push(leg.pairKey)
      continue
    }
    contracts[leg.pairKey] = count
    // What the order actually spends, not what was typed: the floor above
    // leaves change, and a total that ignores it overstates the cost.
    totalStake += count * price
    coverage += price
    bestPayout = Math.max(bestPayout, count)
  }

  return {
    totalStake,
    contracts,
    bestPayout,
    bestProfit: bestPayout - totalStake,
    coverage,
    unusable,
  }
}
