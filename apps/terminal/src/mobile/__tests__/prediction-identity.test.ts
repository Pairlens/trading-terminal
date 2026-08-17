// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the phone prints over a prediction chart, and when it prints nothing.
 *
 * Every case here is a state a user can actually land in: a warm pin from a
 * Discover tap, a cold `/pair/…` link opened on a fresh profile, a venue this
 * build cannot reach, and Polymarket answering with a condition hash where a
 * question should be. The failure this pins is the quiet one — a ticket that
 * takes money against a contract nobody named.
 */
import { describe, expect, it } from 'bun:test'

import { predictionIdentity } from '../lib/prediction-identity'
import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

const YES = { pairKey: 'EVT-YES', label: 'Yes', price: 0.68 }
const NO = { pairKey: 'EVT-NO', label: 'No', price: 0.32 }

const MARKET: PredictionMarketSummary = {
  id: 'mkt-1',
  title: 'Will Bitcoin close above $120,000 on August 15?',
  rules: 'Resolves Yes if the Coinbase BTC-USD 4pm ET print is above 120000.',
  endMs: 1_760_000_000_000,
  outcomes: [YES, NO],
}

const EVENT: PredictionEventSummary = {
  id: 'evt-1',
  market: 'polymarket',
  title: 'Bitcoin price on August 15',
  markets: [MARKET],
  endMs: 1_760_000_000_001,
}

function context(
  patch: Partial<PredictionEventContext> = {},
): PredictionEventContext {
  return {
    state: 'ready',
    entry: null,
    venue: 'polymarket',
    venueLabel: 'Polymarket',
    event: EVENT,
    market: MARKET,
    outcome: YES,
    runners: [],
    isRace: false,
    title: EVENT.title,
    error: null,
    ...patch,
  }
}

describe('predictionIdentity', () => {
  it('prints nothing when there is neither a pin nor an event', () => {
    // The genuine cold miss: a shared link whose venue never answered. A card
    // here would restate the routing key as if it were a heading.
    expect(
      predictionIdentity(
        context({
          state: 'not-found',
          event: null,
          market: null,
          outcome: null,
          title: 'KXBTCD-26AUG15-T53',
        }),
      ),
    ).toBeNull()
  })

  it('resolves a cold link from the event alone', () => {
    // No pin at all — the fix this whole module exists for.
    const identity = predictionIdentity(context())
    expect(identity?.question).toBe(MARKET.title)
    expect(identity?.resolvesAt).toBe(MARKET.endMs)
    expect(identity?.outcomeLabel).toBe('Yes')
    expect(identity?.rules).toBe(MARKET.rules)
    expect(identity?.event).toBe(EVENT)
  })

  it('renders from the pin while the event is still loading', () => {
    const identity = predictionIdentity(
      context({
        state: 'loading',
        event: null,
        market: null,
        outcome: null,
        entry: {
          market: 'polymarket',
          predictionMarketId: 'mkt-1',
          outcome: 'Yes',
          name: 'Will Bitcoin close above $120,000 on August 15? - Yes',
          eventTitle: EVENT.title,
          endMs: 1_759_000_000_000,
        },
        title: EVENT.title,
      }),
    )
    expect(identity?.question).toBe(
      'Will Bitcoin close above $120,000 on August 15?',
    )
    expect(identity?.resolvesAt).toBe(1_759_000_000_000)
    // No event means no way in: the caller must render a heading, not a
    // control that opens nothing.
    expect(identity?.event).toBeNull()
  })

  it('refuses an opaque market title and falls back to something readable', () => {
    // Polymarket returns the condition hash as the title on some markets. It
    // is a routing id, not a question, and printing it is worse than printing
    // the event heading.
    const hash = `0x${'d4e77ba6'.repeat(8)}`
    const identity = predictionIdentity(
      context({ market: { ...MARKET, title: hash } }),
    )
    expect(identity?.question).toBe(EVENT.title)
  })

  it('prefers the venue-fresh question over the pinned one', () => {
    // Both are readable, so the live board wins: a market the venue re-worded
    // should not keep reading as whatever was pinned last month.
    const identity = predictionIdentity(
      context({
        entry: {
          market: 'polymarket',
          predictionMarketId: 'mkt-1',
          outcome: 'Yes',
          name: 'An older wording of the question - Yes',
        },
      }),
    )
    expect(identity?.question).toBe(MARKET.title)
  })

  it('carries the desktop-only state as a heading, never as an error', () => {
    // Kalshi in a browser. The pin still names the contract; there is simply
    // no event to open, and that is not a failure worth a banner.
    const identity = predictionIdentity(
      context({
        state: 'desktop-only',
        venue: 'kalshi',
        venueLabel: 'Kalshi',
        event: null,
        market: null,
        outcome: null,
        entry: {
          market: 'kalshi',
          predictionMarketId: 'KXBTCD-26AUG15-T53',
          outcome: 'Yes',
          name: 'Bitcoin above 120k on Aug 15? - Yes',
        },
      }),
    )
    expect(identity?.question).toBe('Bitcoin above 120k on Aug 15?')
    expect(identity?.event).toBeNull()
    expect(identity?.venueLabel).toBe('Kalshi')
  })
})
