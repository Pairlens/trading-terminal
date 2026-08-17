// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One paced door for every LI.FI request this process makes, and it is paced
 * tight on purpose.
 *
 * The keyless budget is 200 requests per rolling two hours, metered per IP and
 * therefore shared by every tab the user has open. A bridge pane that requotes
 * every 60 seconds spends 120 of those on its own, so the pacing here is about
 * the case that matters: a quote pane plus a handful of transfers being polled,
 * against a budget that a single enthusiastic afternoon can exhaust. Once
 * exhausted the WHOLE provider answers 429, and a 429 on the status path would
 * read as "your transfer is not there", which is the one wrong answer this
 * connector must never give.
 *
 * A free API key raises the ceiling to 200 a minute, so `setLifiApiKey` swaps
 * the process onto the looser limiter as well as adding the header. Nothing
 * else changes: the same fetch, the same classification.
 */
import { restFetch } from '@pairlens/market-engine/http'
import { providerThrottleFromResponse } from '@pairlens/market-engine/errors'
import { noteProviderThrottled } from '@pairlens/market-engine/provider-throttle'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import type { RequestLimiter } from '@pairlens/market-engine/request-limiter'

/** Provider id in the shared throttle registry, and the label users read. */
export const LIFI_PROVIDER = 'LI.FI'

export const LIFI_API = 'https://li.quest/v1'

/**
 * Keyless: 60 an hour, sliding. The documented budget is 200 per rolling two
 * hours, so this spends about 60% of it and leaves the rest for a second window
 * on the same IP and for the retries a browser makes on our behalf. A cold start
 * still spends what it needs — the window only holds callers back once full.
 */
export const KEYLESS_CAPACITY = 60
export const KEYLESS_WINDOW_MS = 3_600_000

/** With a key: 120 a minute against a documented 200, same headroom rule. */
export const KEYED_CAPACITY = 120
export const KEYED_WINDOW_MS = 60_000

export const keylessLimiter = createRequestLimiter({
  capacity: KEYLESS_CAPACITY,
  windowMs: KEYLESS_WINDOW_MS,
})

export const keyedLimiter = createRequestLimiter({
  capacity: KEYED_CAPACITY,
  windowMs: KEYED_WINDOW_MS,
})

let apiKey: string | null = null

/**
 * Bind (or clear) the API key. Called from the plugin's `initialize`, which is
 * also how a key pasted into the Plugin Store reaches this module.
 */
export function setLifiApiKey(key: string | null): void {
  apiKey = key && key.trim() ? key.trim() : null
}

export function lifiApiKeySet(): boolean {
  return apiKey !== null
}

/** The limiter in force right now: the keyed one only once a key is bound. */
export function activeLimiter(): RequestLimiter {
  return apiKey === null ? keylessLimiter : keyedLimiter
}

/**
 * `restFetch` with the budget in front of it and 429/5xx classified.
 *
 * A 404 passes through untouched: on the quote path it means "no route", on
 * the status path "not indexed yet", and both are answers a caller must be
 * able to tell apart from a refusal.
 */
export async function lifiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  await activeLimiter().acquire()
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/json')
  if (apiKey !== null) headers.set('x-lifi-api-key', apiKey)
  const res = await restFetch(`${LIFI_API}${path}`, { ...init, headers })
  const throttled = providerThrottleFromResponse(res, LIFI_PROVIDER)
  if (throttled) {
    // Hold the queue back, and tell the terminal, so the silence that follows
    // is not read as an empty answer by the panes.
    activeLimiter().cooldown(throttled.retryAfterMs)
    noteProviderThrottled(LIFI_PROVIDER, throttled.retryAfterMs)
    throw throttled
  }
  return res
}

/** Test seam: forget the key and both windows. */
export function resetLifiTransport(): void {
  apiKey = null
  keylessLimiter.reset()
  keyedLimiter.reset()
}
