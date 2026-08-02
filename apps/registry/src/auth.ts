// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Registry authentication for gated download endpoints.
 *
 * A Bearer token is accepted if EITHER:
 *   1. it matches one of `REGISTRY_API_TOKENS` (comma-separated static tokens,
 *      for CI / service accounts), compared in constant time; or
 *   2. it validates as a live user session against the App Server
 *      (`APP_SERVER_URL/api/internal/verify-session`).
 *
 * Verdicts are cached briefly to avoid hammering the App Server. Verification
 * fails closed: any error, timeout, or missing config denies access.
 *
 * This replaces the previous stub that accepted any non-empty Bearer token.
 */

const APP_SERVER_URL = (
  process.env.APP_SERVER_URL ?? 'http://localhost:4046'
).replace(/\/$/, '')
const REGISTRY_SHARED_SECRET = process.env.REGISTRY_SHARED_SECRET ?? ''
const VERIFY_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 60_000

const STATIC_TOKENS: Array<string> = (process.env.REGISTRY_API_TOKENS ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter((t) => t.length > 0)

type CacheEntry = { valid: boolean; expiresAt: number }
const verdictCache = new Map<string, CacheEntry>()

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function matchesStaticToken(token: string): boolean {
  // Compare against every configured token (constant time per comparison).
  let matched = false
  for (const t of STATIC_TOKENS) {
    if (timingSafeEqual(token, t)) matched = true
  }
  return matched
}

async function verifyWithAppServer(token: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(`${APP_SERVER_URL}/api/internal/verify-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(REGISTRY_SHARED_SECRET
          ? { 'x-registry-secret': REGISTRY_SHARED_SECRET }
          : {}),
      },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
    if (!res.ok) return false
    const data = (await res.json()) as { valid?: unknown }
    return data.valid === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const [scheme, token] = auth.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

/**
 * Returns true iff the request carries a valid registry credential.
 * Static tokens are checked first (cheap); session tokens are verified against
 * the App Server with a short-lived cache.
 */
export async function isAuthenticated(req: Request): Promise<boolean> {
  const token = extractBearer(req)
  if (!token) return false

  if (matchesStaticToken(token)) return true

  const now = Date.now()
  const cached = verdictCache.get(token)
  if (cached && cached.expiresAt > now) return cached.valid

  const valid = await verifyWithAppServer(token)
  verdictCache.set(token, { valid, expiresAt: now + CACHE_TTL_MS })
  // Opportunistic cleanup to bound the cache.
  if (verdictCache.size > 1000) {
    for (const [k, v] of verdictCache) {
      if (v.expiresAt <= now) verdictCache.delete(k)
    }
  }
  return valid
}
