// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The classification and the registry behind the DEX rate-limit fix.
 *
 * The property under test is one sentence: a provider refusing a REQUEST must
 * never be readable as a venue refusing a MARKET. Everything here exists to
 * keep the two apart — 429 and 5xx classify as retryable, every other status
 * classifies as nothing at all, and the registry answers "is this provider
 * cooling off" for the one consumer that would otherwise publish a permanent
 * verdict over it.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import {
  ProviderThrottledError,
  THROTTLE_COOLDOWN_MS,
  TRANSIENT_COOLDOWN_MS,
  isProviderThrottledError,
  parseRetryAfterMs,
  providerThrottleFromResponse,
} from '../errors'
import {
  assertNotThrottled,
  isProviderThrottled,
  noteProviderThrottled,
  providerThrottledUntil,
  resetProviderThrottles,
} from '../provider-throttle'

const withHeaders = (
  status: number,
  headers: Record<string, string> = {},
): { status: number; headers: { get: (n: string) => string | null } } => ({
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
})

afterEach(() => {
  resetProviderThrottles()
})

describe('parseRetryAfterMs', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000)
    expect(parseRetryAfterMs(' 1.5 ')).toBe(1500)
  })

  it('reads an HTTP date in the future', () => {
    const at = new Date(Date.now() + 20_000).toUTCString()
    const ms = parseRetryAfterMs(at)
    expect(ms).not.toBeNull()
    expect(ms!).toBeGreaterThan(15_000)
    expect(ms!).toBeLessThanOrEqual(20_000)
  })

  it('treats a past date, a zero and junk as absent', () => {
    expect(parseRetryAfterMs(new Date(Date.now() - 5_000).toUTCString())).toBe(
      null,
    )
    expect(parseRetryAfterMs('0')).toBe(null)
    expect(parseRetryAfterMs('soon')).toBe(null)
    expect(parseRetryAfterMs('')).toBe(null)
    expect(parseRetryAfterMs(null)).toBe(null)
    expect(parseRetryAfterMs(undefined)).toBe(null)
  })
})

describe('providerThrottleFromResponse', () => {
  it('classifies 429 with the provider s own Retry-After', () => {
    const err = providerThrottleFromResponse(
      withHeaders(429, { 'retry-after': '12' }),
      'GeckoTerminal',
    )
    expect(isProviderThrottledError(err)).toBe(true)
    expect(err!.status).toBe(429)
    expect(err!.retryAfterMs).toBe(12_000)
    expect(err!.provider).toBe('GeckoTerminal')
  })

  it('falls back to the default cool-off when no Retry-After is sent', () => {
    // GeckoTerminal's free tier is the reason this default exists: it 429s
    // without a header, so a caller with no fallback would retry instantly and
    // stay limited.
    const err = providerThrottleFromResponse(withHeaders(429), 'GeckoTerminal')
    expect(err!.retryAfterMs).toBe(THROTTLE_COOLDOWN_MS)
  })

  it('classifies every 5xx as transient, with a shorter cool-off', () => {
    for (const status of [500, 502, 503, 504, 599]) {
      const err = providerThrottleFromResponse(
        withHeaders(status),
        'DexPaprika',
      )
      expect(isProviderThrottledError(err)).toBe(true)
      expect(err!.status).toBe(status)
      expect(err!.retryAfterMs).toBe(TRANSIENT_COOLDOWN_MS)
    }
  })

  it('classifies nothing else, so a real refusal stays a real refusal', () => {
    // 404 is the one that matters: it means the pool/pair genuinely is not
    // there, and swallowing it into "retry later" would hide an empty state
    // behind a spinner forever.
    for (const status of [200, 204, 301, 400, 401, 403, 404, 418, 451]) {
      expect(
        providerThrottleFromResponse(withHeaders(status), 'GeckoTerminal'),
      ).toBeNull()
    }
  })

  it('survives a response whose headers cannot be read', () => {
    const hostile = {
      status: 429,
      headers: {
        get() {
          throw new Error('no headers here')
        },
      },
    }
    const err = providerThrottleFromResponse(hostile, 'GeckoTerminal')
    expect(err!.retryAfterMs).toBe(THROTTLE_COOLDOWN_MS)
  })

  it('works with no headers at all', () => {
    expect(
      providerThrottleFromResponse({ status: 429 }, 'GeckoTerminal')!.status,
    ).toBe(429)
  })
})

describe('isProviderThrottledError', () => {
  it('matches real instances', () => {
    expect(
      isProviderThrottledError(new ProviderThrottledError('X', 429, 1)),
    ).toBe(true)
  })

  it('matches cross-bundle instances by name and by sentinel', () => {
    const byName = new Error('x')
    byName.name = 'ProviderThrottledError'
    expect(isProviderThrottledError(byName)).toBe(true)

    const bySentinel = new Error('x') as Error & { __providerThrottled?: true }
    bySentinel.__providerThrottled = true
    expect(isProviderThrottledError(bySentinel)).toBe(true)
  })

  it('does not match the other typed connector errors or plain ones', () => {
    const geo = new Error('x')
    geo.name = 'GeoRestrictedError'
    expect(isProviderThrottledError(geo)).toBe(false)
    expect(isProviderThrottledError(new Error('429'))).toBe(false)
    expect(isProviderThrottledError(null)).toBe(false)
  })

  it('says 429 in words a user can act on, with no HTTP status in the copy', () => {
    const err = new ProviderThrottledError('GeckoTerminal', 429, 15_000)
    expect(err.message).toBe(
      'GeckoTerminal is rate limiting requests. Try again shortly.',
    )
    expect(err.message).not.toContain('429')
  })
})

describe('the throttle registry', () => {
  it('reports a provider throttled for the window it was given', () => {
    expect(isProviderThrottled('GeckoTerminal')).toBe(false)
    noteProviderThrottled('GeckoTerminal', 5_000)
    expect(isProviderThrottled('GeckoTerminal')).toBe(true)
    // The wildcard read is what the candle stream uses: it does not know which
    // provider serves a DEX market.
    expect(isProviderThrottled()).toBe(true)
    expect(isProviderThrottled('DexPaprika')).toBe(false)
  })

  it('extends a window, never shortens it', () => {
    noteProviderThrottled('GeckoTerminal', 30_000)
    const long = providerThrottledUntil('GeckoTerminal')
    noteProviderThrottled('GeckoTerminal', 1_000)
    expect(providerThrottledUntil('GeckoTerminal')).toBe(long)
    noteProviderThrottled('GeckoTerminal', 60_000)
    expect(providerThrottledUntil('GeckoTerminal')).toBeGreaterThan(long)
  })

  it('expires rather than latching, which is the whole point', () => {
    // A verdict that outlives the limit is the defect. A zero-length window is
    // already over, so it must read as clear immediately.
    noteProviderThrottled('GeckoTerminal', 0)
    expect(isProviderThrottled('GeckoTerminal')).toBe(false)
    expect(isProviderThrottled()).toBe(false)
    noteProviderThrottled('GeckoTerminal', -5_000)
    expect(isProviderThrottled('GeckoTerminal')).toBe(false)
  })

  it('an expired entry does not keep the wildcard read alive', () => {
    noteProviderThrottled('Expired', 0)
    noteProviderThrottled('Live', 10_000)
    expect(providerThrottledUntil()).toBe(providerThrottledUntil('Live'))
  })
})

describe('assertNotThrottled', () => {
  it('registers the cool-off and throws, in one step', () => {
    let thrown: unknown
    try {
      assertNotThrottled(withHeaders(429, { 'retry-after': '9' }), 'DexPaprika')
    } catch (e) {
      thrown = e
    }
    expect(isProviderThrottledError(thrown)).toBe(true)
    // Registering is the load-bearing half: without it the terminal is free to
    // publish "this venue carries no data for this pair".
    expect(isProviderThrottled('DexPaprika')).toBe(true)
  })

  it('is a no-op on anything else', () => {
    expect(() =>
      assertNotThrottled({ status: 200 }, 'DexPaprika'),
    ).not.toThrow()
    expect(() =>
      assertNotThrottled({ status: 404 }, 'DexPaprika'),
    ).not.toThrow()
    expect(isProviderThrottled()).toBe(false)
  })
})
