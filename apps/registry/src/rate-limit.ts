// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Per-IP fixed-window rate limiter for the auth-gated download endpoints.
 *
 * Purpose: cap the cost of token-spray attacks. Every unknown Bearer token on
 * a gated endpoint costs a session-verification round trip to the App Server
 * and a verdict-cache entry — limiting per client IP bounds both.
 *
 * In-memory and per-process by design (the registry is a single instance; a
 * restart resetting counters is fine). Fails open only in the sense that a
 * brand-new window admits traffic again — verification itself still fails
 * closed in auth.ts.
 *
 * Client IP: Railway (and most proxies) set `x-forwarded-for`; the first hop
 * is the client. Falls back to a shared bucket when no IP is derivable, which
 * only matters when running directly exposed without a proxy.
 */

const WINDOW_MS = 60_000
const DEFAULT_LIMIT = 120
const MAX_TRACKED_IPS = 10_000

const LIMIT = (() => {
  const parsed = Number.parseInt(process.env.REGISTRY_RATE_LIMIT ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT
})()

type Window = { count: number; windowStart: number }
const windows = new Map<string, Window>()

export function clientIpOf(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

/**
 * Returns true when the request is within the per-IP budget; false when it
 * should be rejected with 429.
 */
export function allowRequest(req: Request, now = Date.now()): boolean {
  const ip = clientIpOf(req)
  const entry = windows.get(ip)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // Bound memory before admitting a new IP: drop expired windows first.
    if (!entry && windows.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of windows) {
        if (now - value.windowStart >= WINDOW_MS) windows.delete(key)
      }
      // Under sustained attack from >MAX_TRACKED_IPS live addresses, refuse
      // new IPs rather than growing without bound.
      if (windows.size >= MAX_TRACKED_IPS) return false
    }
    windows.set(ip, { count: 1, windowStart: now })
    return true
  }

  entry.count += 1
  return entry.count <= LIMIT
}

/** Test hook: clear all tracked windows. */
export function resetRateLimiter(): void {
  windows.clear()
}
