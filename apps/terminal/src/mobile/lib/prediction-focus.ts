// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the phone is looking at, in two parts.
 *
 * For every asset class but one they are the same string, and the shell could
 * carry a single `pair` the way it used to. A prediction is the exception the
 * split exists for: its pair is an EVENT — one question with anywhere from two
 * to a hundred and twenty-eight tradeable answers — and an event has no book,
 * no tape and no candles of its own.
 *
 * So `instrument` is what the user opened and what the address, the watchlist
 * and the recents strip carry, and `pair` is the answer currently being
 * streamed and traded. Keeping the second one named `pair` is deliberate:
 * every chart, ticket and overlay below already reads `focusedPair` and every
 * one of them wants the leg, so the split costs the shell one field rather
 * than a rename across twelve files.
 *
 * Pure, and separate from the root that holds it, because the rule below is
 * the one that can be wrong in a way nobody notices until money moves: a leg
 * carried over from the previous question would sit in a live ticket under a
 * heading naming a different market.
 */
import type { InstrumentClass } from '@pairlens/shared/market-ref'

import { normalizePairKey } from '@/lib/pairs'

export type MobileFocusState = {
  /** The instrument: the event on a prediction, the pair on everything else. */
  instrument: string
  /**
   * The leg being streamed. Empty for a prediction whose field has not
   * resolved yet, which every stream already treats as "subscribe to nothing".
   */
  pair: string
  cls: InstrumentClass
}

/**
 * Where an instrument and its leg start out.
 *
 * Only a prediction can have them differ, and only there does an empty leg
 * mean anything: the field has not resolved, so nothing is streaming yet and
 * the desk is free to open on the favourite.
 */
export function seedFocus(
  id: string,
  cls: InstrumentClass,
  outcome: string,
): MobileFocusState {
  const instrument = normalizePairKey(id)
  if (cls !== 'prediction') return { instrument, pair: instrument, cls }
  return { instrument, pair: normalizePairKey(outcome), cls }
}

/**
 * Move to another instrument.
 *
 * A different question means a different field, so the leg is dropped rather
 * than carried over: the desk re-picks the favourite, and a key belonging to
 * the previous event never reaches a ticket that is now headed by this one.
 */
export function focusInstrument(
  prev: MobileFocusState,
  id: string,
  cls?: InstrumentClass,
): MobileFocusState {
  const instrument = normalizePairKey(id)
  const next = cls ?? prev.cls
  if (prev.instrument === instrument && prev.cls === next) return prev
  return seedFocus(instrument, next, '')
}

/**
 * Switch to another answer of the SAME question. The instrument does not move,
 * so neither does the address or the history.
 */
export function focusOutcome(
  prev: MobileFocusState,
  outcomeKey: string,
): MobileFocusState {
  const pair = normalizePairKey(outcomeKey)
  if (prev.pair === pair) return prev
  return { ...prev, pair }
}

/** Open a question ON a specific answer, in one commit. */
export function focusPrediction(
  prev: MobileFocusState,
  eventKey: string,
  outcomeKey: string,
): MobileFocusState {
  const instrument = normalizePairKey(eventKey)
  const pair = normalizePairKey(outcomeKey)
  if (
    prev.instrument === instrument &&
    prev.pair === pair &&
    prev.cls === 'prediction'
  ) {
    return prev
  }
  return { instrument, pair, cls: 'prediction' }
}

/**
 * The leg an incoming address names, if it names one.
 *
 * The phone accepts `?o=` so a link built on a desktop arrives on the answer
 * it meant. It does not write it back: the phone's own canonical address is
 * the question, because that is the instrument, and a link shared from a phone
 * should open the market rather than someone else's side of it.
 */
export function outcomeFromSearch(search: unknown): string {
  if (!search || typeof search !== 'object') return ''
  const value = (search as { o?: unknown }).o
  return typeof value === 'string' ? normalizePairKey(value) : ''
}
