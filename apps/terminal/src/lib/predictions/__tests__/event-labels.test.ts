// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  isOpaqueTitle,
  marketSubtitle,
  predictionOutcomeName,
  shortenId,
} from '../event-labels'

const CONDITION_ID =
  '0xd4e77ba6f29fc093509d24f508631abd445ecf506bbdc9c4c80e60256a318527'

describe('isOpaqueTitle', () => {
  it('flags a bare identifier', () => {
    expect(isOpaqueTitle(CONDITION_ID)).toBe(true)
  })

  it('leaves a question alone, however long', () => {
    expect(
      isOpaqueTitle('Will the Fed cut rates at the December 2026 meeting?'),
    ).toBe(false)
  })

  it('leaves a short unspaced label alone — a ticker is not an id', () => {
    expect(isOpaqueTitle('KXBTCD-26AUG15-T53')).toBe(false)
  })
})

describe('shortenId', () => {
  it('keeps both ends, so two rows stay distinguishable', () => {
    expect(shortenId(CONDITION_ID)).toBe('0xd4e77b…8527')
  })

  it('leaves anything already short', () => {
    expect(shortenId('cond-1')).toBe('cond-1')
  })
})

describe('marketSubtitle', () => {
  it('says nothing on a single-market event — the heading already did', () => {
    expect(marketSubtitle('Will it rain?', 'Will it rain?', 1)).toBeNull()
    expect(marketSubtitle(CONDITION_ID, 'Will it rain?', 1)).toBeNull()
  })

  it('shows a real per-market question', () => {
    expect(marketSubtitle('Two cuts', 'How many Fed cuts?', 3)).toBe('Two cuts')
  })

  it('shortens an id rather than dropping it — it is the only thing separating rows', () => {
    expect(marketSubtitle(CONDITION_ID, 'How many Fed cuts?', 3)).toBe(
      '0xd4e77b…8527',
    )
  })

  it('does not repeat the event heading', () => {
    expect(marketSubtitle('Same', 'Same', 4)).toBeNull()
  })
})

describe('predictionOutcomeName', () => {
  it('uses the market question when there is one', () => {
    expect(predictionOutcomeName('Two cuts', 'How many Fed cuts?', 'Yes', 3)) //
      .toBe('Two cuts - Yes')
  })

  it('falls back to the event heading on a single-market event', () => {
    expect(
      predictionOutcomeName(CONDITION_ID, 'Will BTC hit 100k?', 'Yes', 1),
    ).toBe('Will BTC hit 100k? - Yes')
  })

  it('keeps a short id on a multi-market event, so outcomes stay distinct', () => {
    expect(
      predictionOutcomeName(CONDITION_ID, 'How many Fed cuts?', 'Yes', 3),
    ).toBe('How many Fed cuts? (0xd4e77b…8527) - Yes')
  })

  it('never emits a bare condition hash as the whole name', () => {
    const name = predictionOutcomeName(CONDITION_ID, '', 'Yes', 1)
    expect(name).toBe(`${CONDITION_ID} - Yes`)
    // No event heading exists to fall back to; the id is all there is.
    expect(predictionOutcomeName(CONDITION_ID, 'Event', 'Yes', 1)).toBe(
      'Event - Yes',
    )
  })
})
