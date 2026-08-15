// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  binarySideOf,
  isOpaqueTitle,
  marketSubtitle,
  predictionOutcomeName,
  predictionTicker,
  shortLabelOf,
  shortenId,
  stripOutcomeSuffix,
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

describe('binarySideOf', () => {
  it('names the two sides of a yes/no market', () => {
    expect(binarySideOf('Yes')).toBe('yes')
    expect(binarySideOf('no')).toBe('no')
    expect(binarySideOf(' No ')).toBe('no')
  })

  it('leaves a categorical answer uncoloured', () => {
    expect(binarySideOf('Gavin Newsom')).toBeNull()
    expect(binarySideOf('Above 13.5M')).toBeNull()
    expect(binarySideOf('')).toBeNull()
  })
})

describe('stripOutcomeSuffix', () => {
  it('undoes the connector join', () => {
    expect(stripOutcomeSuffix('Will X win? - Yes', 'Yes')).toBe('Will X win?')
  })

  it('leaves a name that does not end in its own outcome', () => {
    expect(stripOutcomeSuffix('Will X win? - Yes', 'No')).toBe(
      'Will X win? - Yes',
    )
    expect(stripOutcomeSuffix('BTC-USDT', '')).toBe('BTC-USDT')
  })
})

describe('predictionTicker', () => {
  const KEY =
    'DEMOCRATIC-PRESIDENTIAL-NOMINEE-2028-GAVIN-NEWSOM-WIN-2028-DEMOCRATIC-PRESIDENTIAL-NOMINATION-568-YES'

  it("prefers the venue's own short label", () => {
    const ticker = predictionTicker(
      {
        name: 'Will Gavin Newsom win the 2028 Democratic presidential nomination? - Yes',
        outcome: 'Yes',
        shortTitle: 'Gavin Newsom',
        eventTitle: 'Democratic Presidential Nominee 2028',
      },
      KEY,
    )
    expect(ticker.subject).toBe('Gavin Newsom')
    expect(ticker.outcome).toBe('Yes')
    // The tooltip stays complete: the label above is lossy on purpose.
    expect(ticker.full).toBe(
      'Will Gavin Newsom win the 2028 Democratic presidential nomination? - Yes',
    )
  })

  it('falls back to the question, minus a repeated event heading', () => {
    const ticker = predictionTicker(
      {
        name: 'Fed decision in March: above 4% - Yes',
        outcome: 'Yes',
        eventTitle: 'Fed decision in March',
      },
      'KXFED-26MAR-T4',
    )
    expect(ticker.subject).toBe('above 4%')
  })

  it('falls back to the event heading when the question is an id', () => {
    const ticker = predictionTicker(
      { name: `${CONDITION_ID} - Yes`, outcome: 'Yes', eventTitle: 'Fed cuts' },
      'POLY-FED',
    )
    expect(ticker.subject).toBe('Fed cuts')
  })

  it('never returns the routing key as the subject', () => {
    const ticker = predictionTicker({ name: KEY, outcome: 'Yes' }, KEY)
    expect(ticker.subject.length).toBeLessThan(20)
    expect(ticker.subject).toBe(shortenId(KEY))
  })
})

describe('shortLabelOf', () => {
  const market = { title: 'Will Gavin Newsom win?', shortTitle: 'Gavin Newsom' }

  it("uses the venue's short label on a multi-market event", () => {
    expect(shortLabelOf(market, 'Democratic Nominee 2028', 30)).toBe(
      'Gavin Newsom',
    )
  })

  it('says nothing on a single-market event, heading already did', () => {
    // Polymarket's short label there is often a bare date, which reads as a
    // second unexplained heading under the first.
    expect(
      shortLabelOf(
        { title: 'Will BTC hit 100k?', shortTitle: 'October 31, 2025' },
        'Will BTC hit 100k?',
        1,
      ),
    ).toBeNull()
  })

  it('falls back to the question when the venue publishes no short label', () => {
    expect(shortLabelOf({ title: 'Two cuts' }, 'How many Fed cuts?', 3)).toBe(
      'Two cuts',
    )
  })
})
