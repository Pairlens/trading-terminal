// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The assistant chat's follow-the-answer behaviour, pinned by the numbers
// that actually broke it.
//
// This decision has shipped wrong twice, and neither failure was caught by
// a growth test, because both need one specific thing: the hook scrolls to
// the bottom, React commits MORE height, and the scroll event we caused is
// then measured against content that is taller than it was. The traces in
// these tests are real, captured from a live session with a probe in the
// page, so they encode the exact shape of the failure rather than a guess
// at it.
import { describe, expect, it } from 'bun:test'

import { decideScrollPin, maxScrollTop } from '../use-stick-to-bottom'

/** Captured live: the panel at the bottom of a finished answer. */
const SETTLED = { top: 110, scrollHeight: 653, clientHeight: 543 }

describe('maxScrollTop', () => {
  it('is scrollHeight minus the viewport, never scrollHeight', () => {
    // The bug: recording 653 as "where we just were" when the element can
    // only ever hold 110 leaves the next event looking like a 543px jump up.
    expect(maxScrollTop(SETTLED)).toBe(110)
    expect(maxScrollTop(SETTLED)).not.toBe(SETTLED.scrollHeight)
  })

  it('never goes negative when the content is shorter than the box', () => {
    expect(maxScrollTop({ scrollHeight: 200, clientHeight: 543 })).toBe(0)
  })
})

describe('decideScrollPin', () => {
  it('pins anywhere within the threshold of the bottom', () => {
    const at = decideScrollPin({ ...SETTLED, lastTop: 0 })
    expect(at).toBe('pin')
    // Even having arrived from above: reaching the bottom IS catching up.
    expect(decideScrollPin({ ...SETTLED, top: 80, lastTop: 500 })).toBe('pin')
  })

  it('unpins when the reader scrolls up', () => {
    expect(
      decideScrollPin({
        top: 200,
        lastTop: 800,
        scrollHeight: 1400,
        clientHeight: 543,
      }),
    ).toBe('unpin')
  })

  it('does NOT unpin when our own jump is measured against taller content', () => {
    // The captured failure. scrollToBottom() lands at 139 (the bottom as it
    // stood), React commits +101px, and the scroll event we caused arrives
    // reporting 73px from the bottom. Distance alone calls that "the reader
    // left"; it was the hook itself.
    expect(
      decideScrollPin({
        top: 139,
        lastTop: 139,
        scrollHeight: 754,
        clientHeight: 543,
      }),
    ).toBe('keep')
  })

  it('does NOT unpin when lastTop was recorded as the clamped target', () => {
    // The second failure, from fixing the first badly: lastTop was set to
    // scrollHeight (682) instead of the reachable maximum (139), so the very
    // next event looked like a 543px scroll upwards and unpinned.
    const withScrollHeight = decideScrollPin({
      top: 139,
      lastTop: 682,
      scrollHeight: 754,
      clientHeight: 543,
    })
    const withClampedTarget = decideScrollPin({
      top: 139,
      lastTop: maxScrollTop({ scrollHeight: 682, clientHeight: 543 }),
      scrollHeight: 754,
      clientHeight: 543,
    })
    expect(withScrollHeight).toBe('unpin') // what shipped, and was wrong
    expect(withClampedTarget).toBe('keep') // what the clamp buys
  })

  it('keeps following through a whole streamed answer', () => {
    // Growth alone must never unpin, however far behind it leaves the view.
    let lastTop = 139
    for (const scrollHeight of [796, 856, 877, 1100, 1508]) {
      const verdict = decideScrollPin({
        top: 139,
        lastTop,
        scrollHeight,
        clientHeight: 543,
      })
      expect(verdict).toBe('keep')
      lastTop = 139
    }
  })

  it('still unpins mid-stream if the reader genuinely scrolls up', () => {
    expect(
      decideScrollPin({
        top: 40,
        lastTop: 139,
        scrollHeight: 1508,
        clientHeight: 543,
      }),
    ).toBe('unpin')
  })
})
