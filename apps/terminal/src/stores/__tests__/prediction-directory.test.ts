// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The prediction directory round-trip.
 *
 * A prediction pair key is a venue ticker and nothing else: the question, the
 * outcome and the venue live only in the pin the picker writes before it
 * navigates. If that pin is lost, a watched outcome does not merely read as a
 * bare ticker — the catalog has no row for it, so the watchlist drops it
 * entirely. So the pin-then-read path is pinned here end to end, from the
 * `PairEntry` a search result carries through to what a later lookup gets.
 */

import { beforeEach, describe, expect, test } from 'bun:test'

import type { Instrument } from '@pairlens/shared/instrument-types'
import { installBrowserGlobals } from '@/lib/security/vault/__tests__/test-globals'

installBrowserGlobals()

const {
  instrumentToPairEntry,
  isPredictionEntry,
  pinSelectedEntry,
  predictionQuestionOf,
} = await import('@/components/pair-picker/pair-picker-data')
const {
  isPredictionEventEntry,
  lookupPredictionEvent,
  lookupPredictionOutcome,
  registerPredictionEvent,
  registerPredictionOutcome,
  usePredictionDirectoryStore,
} = await import('@/stores/prediction-directory-store')

const OUTCOME: Instrument = {
  id: 'kalshi:KXBTCD-26AUG15-T53',
  kind: 'prediction',
  market: 'kalshi',
  symbol: 'KXBTCD-26AUG15-T53',
  name: 'Will Bitcoin close above $53k on Aug 15? - Yes',
  base: 'USD',
  quote: 'USD',
  assetClass: 'prediction',
  categories: [],
  rank: 1,
  featured: false,
  predictionMarketId: 'KXBTCD-26AUG15-T53',
  outcome: 'Yes',
  eventId: 'KXBTCD-26AUG15',
  eventTitle: 'Bitcoin price on Aug 15',
  endMs: 1_755_302_400_000,
}

beforeEach(() => {
  usePredictionDirectoryStore.getState().clear()
})

describe('instrumentToPairEntry — prediction arm', () => {
  test('carries the outcome identity the pair key drops', () => {
    const entry = instrumentToPairEntry(OUTCOME)
    expect(isPredictionEntry(entry)).toBe(true)
    expect(entry.predictionMarketId).toBe('KXBTCD-26AUG15-T53')
    expect(entry.outcome).toBe('Yes')
    expect(entry.market).toBe('kalshi')
    expect(entry.eventId).toBe('KXBTCD-26AUG15')
    expect(entry.eventTitle).toBe('Bitcoin price on Aug 15')
    expect(entry.endMs).toBe(1_755_302_400_000)
  })

  test('a spot pair grows no prediction fields', () => {
    const entry = instrumentToPairEntry({
      id: 'BTC-USDT',
      kind: 'cex-pair',
      market: 'binance',
      symbol: 'BTC-USDT',
      name: 'Bitcoin',
      base: 'BTC',
      quote: 'USDT',
      assetClass: 'crypto-spot',
      categories: [],
      rank: 1,
    })
    expect(isPredictionEntry(entry)).toBe(false)
    expect(entry.predictionMarketId).toBeUndefined()
  })
})

describe('predictionQuestionOf', () => {
  test('drops the outcome the connector appends to the name', () => {
    expect(predictionQuestionOf(instrumentToPairEntry(OUTCOME))).toBe(
      'Will Bitcoin close above $53k on Aug 15?',
    )
  })

  test('a name that does not end in its outcome is left alone', () => {
    const entry = instrumentToPairEntry({
      ...OUTCOME,
      name: 'Yes on something else',
    })
    expect(predictionQuestionOf(entry)).toBe('Yes on something else')
  })
})

describe('pinSelectedEntry', () => {
  test('pins the outcome under its pair key before navigation', () => {
    pinSelectedEntry(instrumentToPairEntry(OUTCOME))
    const pinned = lookupPredictionOutcome('KXBTCD-26AUG15-T53')
    expect(pinned).not.toBeNull()
    expect(pinned?.market).toBe('kalshi')
    expect(pinned?.outcome).toBe('Yes')
    expect(pinned?.name).toBe('Will Bitcoin close above $53k on Aug 15? - Yes')
    expect(pinned?.eventTitle).toBe('Bitcoin price on Aug 15')
    expect(pinned?.endMs).toBe(1_755_302_400_000)
  })

  test('the lookup normalizes the key the route would have mangled', () => {
    pinSelectedEntry(instrumentToPairEntry(OUTCOME))
    // The route uppercases and rewrites `_` and `/` — a lookup has to survive
    // the same treatment the URL gives the key.
    expect(lookupPredictionOutcome('kxbtcd-26aug15-t53')).not.toBeNull()
  })

  test('a non-prediction row pins nothing', () => {
    pinSelectedEntry({
      id: 'BTC-USDT',
      symbol: 'BTC-USDT',
      name: 'Bitcoin',
      base: 'BTC',
      quote: 'USDT',
      categories: [],
      rank: 1,
    })
    expect(usePredictionDirectoryStore.getState().outcomes).toEqual({})
  })

  test('a re-pin of the same outcome does not churn the store', () => {
    pinSelectedEntry(instrumentToPairEntry(OUTCOME))
    const first = usePredictionDirectoryStore.getState().outcomes
    pinSelectedEntry(instrumentToPairEntry(OUTCOME))
    expect(usePredictionDirectoryStore.getState().outcomes).toBe(first)
  })
})

describe('registerPredictionOutcome', () => {
  test('survives a reload — the pin is written through to storage', () => {
    registerPredictionOutcome('POLY-FED-CUT-YES', {
      market: 'polymarket',
      predictionMarketId: '0xabc',
      outcome: 'Yes',
      name: 'Will the Fed cut in September? - Yes',
    })
    const raw = localStorage.getItem('pairlens:prediction-directory')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as {
      outcomes: Record<string, { market: string }>
    }
    expect(parsed.outcomes['POLY-FED-CUT-YES']?.market).toBe('polymarket')
  })
})

describe('registerPredictionEvent', () => {
  const EVENT = {
    market: 'polymarket',
    eventId: '903193',
    title: 'Who wins the 2028 Democratic nomination?',
    outcomeCount: 12,
    leader: { pairKey: 'POLY-NEWSOM-YES', label: 'Gavin Newsom', price: 0.31 },
  }

  test('a pair key names the event, and the pin carries its favourite', () => {
    registerPredictionEvent('903193', EVENT)
    const pinned = lookupPredictionEvent('903193')
    expect(pinned?.title).toBe('Who wins the 2028 Democratic nomination?')
    expect(pinned?.leader?.label).toBe('Gavin Newsom')
    expect(pinned?.leader?.pairKey).toBe('POLY-NEWSOM-YES')
  })

  test('the two maps do not collide — a key can be read as either', () => {
    registerPredictionEvent('903193', EVENT)
    registerPredictionOutcome('POLY-NEWSOM-YES', {
      market: 'polymarket',
      predictionMarketId: '0xabc',
      outcome: 'Yes',
      name: 'Will Gavin Newsom win the nomination? - Yes',
      eventId: '903193',
    })
    expect(lookupPredictionEvent('POLY-NEWSOM-YES')).toBeNull()
    expect(lookupPredictionOutcome('903193')).toBeNull()
    expect(lookupPredictionOutcome('POLY-NEWSOM-YES')?.eventId).toBe('903193')
  })

  test('the guard tells an event pin from an outcome pin', () => {
    registerPredictionEvent('903193', EVENT)
    registerPredictionOutcome('POLY-NEWSOM-YES', {
      market: 'polymarket',
      predictionMarketId: '0xabc',
      // An outcome names its event too, so `eventId` narrows nothing.
      eventId: '903193',
      outcome: 'Yes',
      name: 'Will Gavin Newsom win the nomination? - Yes',
    })
    expect(isPredictionEventEntry(lookupPredictionEvent('903193'))).toBe(true)
    expect(
      isPredictionEventEntry(lookupPredictionOutcome('POLY-NEWSOM-YES')),
    ).toBe(false)
  })

  test('survives a reload under its own map', () => {
    registerPredictionEvent('903193', EVENT)
    const parsed = JSON.parse(
      localStorage.getItem('pairlens:prediction-directory')!,
    ) as { events: Record<string, { title: string }> }
    expect(parsed.events['903193']?.title).toBe(
      'Who wins the 2028 Democratic nomination?',
    )
  })
})
