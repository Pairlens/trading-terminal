// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The phone's two-part focus: a question, and the answer being traded.
 *
 * The rule worth pinning is the one that fails silently. A leg carried over
 * from the previous question would sit in a live ticket under a heading naming
 * a different market, and the ticket has no way to notice: an outcome key is a
 * venue string, and every venue string looks equally plausible to a form.
 */
import { describe, expect, test } from 'bun:test'

import {
  focusInstrument,
  focusOutcome,
  focusPrediction,
  outcomeFromSearch,
  seedFocus,
} from '../lib/prediction-focus'

const FED = seedFocus('KXFED-26MAR', 'prediction', 'KXFED-26MAR-CUT')

describe('seedFocus', () => {
  test('a pair that IS its instrument gets both halves', () => {
    expect(seedFocus('btc-usdt', 'spot', '')).toEqual({
      instrument: 'BTC-USDT',
      pair: 'BTC-USDT',
      cls: 'spot',
    })
  })

  test('a question with no answer named streams nothing until the field lands', () => {
    expect(seedFocus('90434', 'prediction', '')).toEqual({
      instrument: '90434',
      pair: '',
      cls: 'prediction',
    })
  })

  test('a question opened on an answer carries both', () => {
    expect(FED).toEqual({
      instrument: 'KXFED-26MAR',
      pair: 'KXFED-26MAR-CUT',
      cls: 'prediction',
    })
  })
})

describe('focusInstrument', () => {
  test('a new question drops the old leg rather than carrying it over', () => {
    const next = focusInstrument(FED, '90434', 'prediction')
    expect(next.instrument).toBe('90434')
    expect(next.pair).toBe('')
  })

  test('re-focusing the same instrument changes nothing, reference included', () => {
    expect(focusInstrument(FED, 'kxfed-26mar')).toBe(FED)
  })

  test('leaving predictions for a pair sets both halves to it', () => {
    const next = focusInstrument(FED, 'ETH-USDT', 'spot')
    expect(next).toEqual({
      instrument: 'ETH-USDT',
      pair: 'ETH-USDT',
      cls: 'spot',
    })
  })
})

describe('focusOutcome', () => {
  test('switching sides moves the leg and leaves the address alone', () => {
    const next = focusOutcome(FED, 'KXFED-26MAR-CUT-NO')
    expect(next.instrument).toBe('KXFED-26MAR')
    expect(next.pair).toBe('KXFED-26MAR-CUT-NO')
  })

  test('re-selecting the leg already held is not a state change', () => {
    expect(focusOutcome(FED, 'kxfed-26mar-cut')).toBe(FED)
  })
})

describe('focusPrediction', () => {
  test('a question and an answer land in one commit', () => {
    const next = focusPrediction(
      seedFocus('BTC-USDT', 'spot', ''),
      '903193',
      'POLY-NEWSOM-YES',
    )
    expect(next).toEqual({
      instrument: '903193',
      pair: 'POLY-NEWSOM-YES',
      cls: 'prediction',
    })
  })

  test('an empty answer is the desk cue to open on the favourite', () => {
    expect(focusPrediction(FED, '903193', '').pair).toBe('')
  })
})

describe('outcomeFromSearch', () => {
  test('a desktop link naming one leg arrives on that leg', () => {
    expect(outcomeFromSearch({ o: 'poly-newsom-yes' })).toBe('POLY-NEWSOM-YES')
  })

  test('anything that is not a leg is no leg at all', () => {
    expect(outcomeFromSearch(undefined)).toBe('')
    expect(outcomeFromSearch({})).toBe('')
    expect(outcomeFromSearch({ o: 7 })).toBe('')
  })
})
