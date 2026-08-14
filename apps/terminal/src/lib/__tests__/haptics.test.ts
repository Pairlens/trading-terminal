// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Haptics, in the parts that can be proven without a phone in your hand.
 *
 * A haptic is unobservable from script — nothing reports that the Taptic
 * Engine fired, or that Android's vibrator was in silent mode — so what is
 * tested here is every decision made BEFORE the device is touched: which
 * backend an environment gets, what a pattern costs a single-intensity
 * backend, and the pacing that stops a burst of taps becoming a rattle.
 * Whether the tick lands is the one thing only a device can answer.
 */
import { describe, expect, test } from 'bun:test'

import {
  HAPTIC_MIN_GAP_MS,
  HAPTIC_PATTERNS,
  haptic,
  hapticsAvailable,
  isAppleTouchDevice,
  isHandheld,
  pickBackend,
  pulseOffsets,
  shouldFire,
} from '../haptics'
import type { HapticKind } from '../haptics'

const KINDS: Array<HapticKind> = [
  'selection',
  'impact',
  'success',
  'warning',
  'error',
]

describe('haptic patterns', () => {
  test('every kind has one', () => {
    for (const kind of KINDS) {
      expect(HAPTIC_PATTERNS[kind]?.length).toBeGreaterThan(0)
    }
  })

  test('no single pulse is long enough to read as a buzz', () => {
    // Anything a user perceives as having a DURATION rather than being an
    // event is the failure mode this feature has: `selection` fires on every
    // row of a scrolling watchlist.
    const long: Array<string> = []
    for (const kind of KINDS) {
      HAPTIC_PATTERNS[kind].forEach((ms, i) => {
        if (i % 2 === 0 && ms > 25) long.push(`${kind}[${i}]=${ms}`)
      })
    }
    expect(long).toEqual([])
  })

  test('selection — the one that fires most — is the shortest', () => {
    const selection = HAPTIC_PATTERNS.selection.reduce((a, b) => a + b, 0)
    for (const kind of KINDS.filter((k) => k !== 'selection')) {
      const total = HAPTIC_PATTERNS[kind].reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThanOrEqual(selection)
    }
  })

  test('patterns alternate pulse/gap, so they never end on a gap', () => {
    // `[10, 70]` would be a tick followed by 70ms of nothing — a gap the
    // Vibration API dutifully waits out and `pulseOffsets` would schedule a
    // pulse past the end of.
    for (const kind of KINDS) {
      expect({ kind, odd: HAPTIC_PATTERNS[kind].length % 2 }).toEqual({
        kind,
        odd: 1,
      })
    }
  })
})

describe('pulseOffsets', () => {
  test('a single pulse starts at zero', () => {
    expect(pulseOffsets([7])).toEqual([0])
  })

  test('a gap pushes the next pulse out by pulse + gap', () => {
    // [tick 10ms, quiet 70ms, tick 20ms] → the second tick begins at 80ms.
    expect(pulseOffsets([10, 70, 20])).toEqual([0, 80])
  })

  test('accumulates across several pulses', () => {
    expect(pulseOffsets([22, 55, 22, 55, 22])).toEqual([0, 77, 154])
  })

  test('every shipped pattern yields one offset per pulse', () => {
    for (const kind of KINDS) {
      const pattern = HAPTIC_PATTERNS[kind]
      const pulses = Math.ceil(pattern.length / 2)
      expect({ kind, offsets: pulseOffsets(pattern).length }).toEqual({
        kind,
        offsets: pulses,
      })
    }
  })

  test('offsets are strictly increasing — no two pulses collide', () => {
    for (const kind of KINDS) {
      const offsets = pulseOffsets(HAPTIC_PATTERNS[kind])
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
      }
    }
  })
})

describe('shouldFire', () => {
  test('the first haptic always fires', () => {
    expect(shouldFire(0, null)).toBe(true)
  })

  test('a second one inside the gap is swallowed', () => {
    expect(shouldFire(1000 + HAPTIC_MIN_GAP_MS - 1, 1000)).toBe(false)
  })

  test('exactly at the gap it fires', () => {
    expect(shouldFire(1000 + HAPTIC_MIN_GAP_MS, 1000)).toBe(true)
  })

  test('a double-tap on one row is one haptic', () => {
    // The real shape of the bug: two clicks ~15ms apart. navigator.vibrate
    // CANCELS the pattern in flight, so without this the first tick is cut
    // short and the user feels less, not more.
    expect(shouldFire(15, 0)).toBe(false)
  })
})

describe('backend selection', () => {
  test('the Vibration API wins wherever it exists', () => {
    expect(
      pickBackend({ handheld: true, hasVibrate: true, appleTouch: false }),
    ).toBe('vibration')
    // Chrome on iOS is WebKit underneath, so it could plausibly report both.
    // The real API is still the better answer.
    expect(
      pickBackend({ handheld: true, hasVibrate: true, appleTouch: true }),
    ).toBe('vibration')
  })

  test('an Apple touch device with no Vibration API gets the switch trick', () => {
    expect(
      pickBackend({ handheld: true, hasVibrate: false, appleTouch: true }),
    ).toBe('taptic')
  })

  test('a desktop browser gets NOTHING even though it exposes the API', () => {
    // This is the whole reason `handheld` exists. Measured in headless Chrome
    // on macOS: `typeof navigator.vibrate === 'function'`, maxTouchPoints 0,
    // and no vibrator anywhere in the machine. Without this gate the Settings
    // card appears on every desktop browser, wired to a no-op.
    expect(
      pickBackend({ handheld: false, hasVibrate: true, appleTouch: false }),
    ).toBe(null)
  })

  test('nothing at all gets nothing, not a guess', () => {
    expect(
      pickBackend({ handheld: false, hasVibrate: false, appleTouch: false }),
    ).toBe(null)
  })
})

describe('isAppleTouchDevice', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
  const IPHONE_CHROME =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
  const IPAD_MODERN =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
  const MAC_SAFARI =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

  test('iPhone Safari', () => {
    expect(isAppleTouchDevice(IPHONE, 5)).toBe(true)
  })

  test('iOS Chrome — same WebKit, same trick', () => {
    expect(isAppleTouchDevice(IPHONE_CHROME, 5)).toBe(true)
  })

  test('iPadOS 13+, which lies about being a Mac, is caught by touch points', () => {
    expect(isAppleTouchDevice(IPAD_MODERN, 5)).toBe(true)
  })

  test('a desktop Mac is not — it sends the identical UA', () => {
    // The ONLY thing separating the two strings is maxTouchPoints, which is
    // why the check cannot be UA alone.
    expect(isAppleTouchDevice(MAC_SAFARI, 0)).toBe(false)
  })

  test('Android is not — it has the real API anyway', () => {
    expect(isAppleTouchDevice(ANDROID, 5)).toBe(false)
  })
})

describe('isHandheld — what decides the Settings card exists', () => {
  const ANDROID_PHONE =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
  const ANDROID_TABLET =
    'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  const MAC_CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  const WINDOWS_TOUCH =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

  test('an Android phone is', () => {
    expect(
      isHandheld({
        uaDataMobile: true,
        userAgent: ANDROID_PHONE,
        maxTouchPoints: 5,
      }),
    ).toBe(true)
  })

  test('an Android tablet is — uaData says false, the UA token carries it', () => {
    // `userAgentData.mobile` is false on tablets, so it can confirm and never
    // deny. A tablet has a vibrator; dropping it here would be a real miss.
    expect(
      isHandheld({
        uaDataMobile: false,
        userAgent: ANDROID_TABLET,
        maxTouchPoints: 5,
      }),
    ).toBe(true)
  })

  test('an iPhone is, with no uaData at all (insecure context)', () => {
    expect(
      isHandheld({
        uaDataMobile: undefined,
        userAgent: IPHONE,
        maxTouchPoints: 5,
      }),
    ).toBe(true)
  })

  test('a desktop Mac is NOT', () => {
    expect(
      isHandheld({
        uaDataMobile: false,
        userAgent: MAC_CHROME,
        maxTouchPoints: 0,
      }),
    ).toBe(false)
  })

  test('a Windows laptop with a TOUCHSCREEN is NOT', () => {
    // Touch points mean a screen you can poke, not one that buzzes. This is
    // the case a naive `maxTouchPoints > 0` check gets wrong.
    expect(
      isHandheld({
        uaDataMobile: false,
        userAgent: WINDOWS_TOUCH,
        maxTouchPoints: 10,
      }),
    ).toBe(false)
  })
})

describe('calling haptic() off a device', () => {
  test('reports unavailable without a DOM', () => {
    expect(hapticsAvailable()).toBe(false)
  })

  test('is a no-op rather than a throw', () => {
    // Every call site is a UI handler. A haptic backend that throws would
    // take the pair switch, the tab change or the order with it.
    for (const kind of KINDS) {
      expect(() => haptic(kind)).not.toThrow()
    }
  })
})
