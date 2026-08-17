// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which data providers are cooling off right now, so a rate limit is never
 * mistaken for a missing market.
 *
 * The producer is a connector/data-provider plugin: when a provider answers
 * 429 it records a cool-off window here. The consumer is the terminal, which
 * has one decision that must not be made during a throttle — publishing "this
 * venue carries no data for this pair", a verdict that survives resubscribes
 * and reaches every pane. A DEX chart has no venue-specific history endpoint to
 * probe, so its only signal is silence, and silence during a throttle is not an
 * answer.
 *
 * Lives in market-engine for the same reason `latency` does: the producers are
 * plugins and the consumer is the UI. Bundled providers are statically imported
 * into the app bundle, so both sides share this module instance. A SANDBOXED
 * third-party provider runs in a worker with its own copy and simply reports
 * nothing, which degrades to the old behavior rather than breaking.
 *
 * Deliberately not reactive and deliberately not a store: callers ask at the
 * moment they are about to make a decision. Nothing renders off it.
 */

import { providerThrottleFromResponse } from './errors'

/** Provider id → epoch ms the cool-off runs until. */
const throttledUntil = new Map<string, number>()

/**
 * Record that `provider` is throttled for the next `coolOffMs`.
 *
 * Windows extend, never shorten: two clients hitting the limit in the same
 * second should not let the second one's shorter estimate cut the first one's
 * short.
 */
export function noteProviderThrottled(
  provider: string,
  coolOffMs: number,
): void {
  const until = Date.now() + Math.max(coolOffMs, 0)
  const current = throttledUntil.get(provider) ?? 0
  if (until > current) throttledUntil.set(provider, until)
}

/**
 * When the cool-off ends, as an epoch ms; 0 when the provider is not throttled.
 * Omit `provider` to ask about the latest cool-off across all of them, which is
 * what a consumer that does not know which provider serves a market wants.
 */
export function providerThrottledUntil(provider?: string): number {
  const now = Date.now()
  if (provider !== undefined) {
    const until = throttledUntil.get(provider) ?? 0
    if (until <= now) {
      throttledUntil.delete(provider)
      return 0
    }
    return until
  }
  let latest = 0
  for (const [id, until] of throttledUntil) {
    if (until <= now) throttledUntil.delete(id)
    else if (until > latest) latest = until
  }
  return latest
}

/** True while `provider` (or any provider) is inside its cool-off window. */
export function isProviderThrottled(provider?: string): boolean {
  return providerThrottledUntil(provider) > 0
}

/**
 * Register and raise, in one call, if `resp` is a 429 or a 5xx.
 *
 * The two steps belong together: a provider that throws a throttle without
 * registering it leaves the terminal free to publish a permanent verdict about
 * a pair that is fine, which is the exact bug this pair of modules exists to
 * close. Callers that also need to pace their own queue (see the GeckoTerminal
 * transport) classify explicitly instead so they can read `retryAfterMs`.
 */
export function assertNotThrottled(
  resp: { status: number; headers?: { get: (name: string) => string | null } },
  provider: string,
): void {
  const throttled = providerThrottleFromResponse(resp, provider)
  if (!throttled) return
  noteProviderThrottled(provider, throttled.retryAfterMs)
  throw throttled
}

/** Test seam. Never called by product code. */
export function resetProviderThrottles(): void {
  throttledUntil.clear()
}
