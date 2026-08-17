// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One paced JSON-RPC client for Solana, and the endpoint the rest of the
 * terminal's Solana code is pointed at.
 *
 * Solana has no equivalent of an exchange's public REST surface: everything —
 * a balance, a token account, an LP position, a transaction send — is a
 * `POST /` JSON-RPC call against a node someone runs. The public node
 * (`api.mainnet-beta.solana.com`) answers with open CORS but refuses
 * unpredictably under load, which is exactly the failure that reads downstream
 * as "this wallet holds nothing". A user's own Helius key removes that, so the
 * endpoint is BYOK with the public node as the honest fallback rather than the
 * default.
 *
 * Two things are deliberate here.
 *
 * The budget is per ENDPOINT, not per caller. A free Helius key allows ~10
 * requests a second and the public node much less, while the callers (balances,
 * LP enumeration, a swap send, the assistant) cannot see each other. So every
 * call queues on one sliding window and a burst waits instead of spending the
 * whole minute's budget in one tick. `capacity` is set below the provider's
 * stated ceiling on purpose: the ceiling is what triggers a 429, not what is
 * safe to sustain.
 *
 * A JSON-RPC `error` member is a THROW, not a null. `getMultipleAccounts`
 * returning `null` for an address means "no such account"; a node answering
 * `-32600` means "we did not look". Collapsing the second into the first is how
 * a rate limit becomes a position that vanished.
 */
import {
  THROTTLE_COOLDOWN_MS,
  providerThrottleFromResponse,
} from '@pairlens/market-engine/errors'
import { noteProviderThrottled } from '@pairlens/market-engine/provider-throttle'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import type { RequestLimiter } from '@pairlens/market-engine/request-limiter'

/** Helius mainnet JSON-RPC. Sends `access-control-allow-origin: *`. */
export const HELIUS_MAINNET_URL = 'https://mainnet.helius-rpc.com/'

/**
 * The keyless fallback. Also CORS-open, and also the reason the key exists:
 * it answers 403/429 under load with no warning and no `Retry-After`.
 */
export const PUBLIC_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'

/**
 * Requests per second, per endpoint.
 *
 * Helius' free tier states ~10/s; 8 leaves headroom for the retry a caller
 * makes after a failure, which the window has no way to anticipate. The public
 * node publishes no number at all, so 2/s is a guess biased towards still
 * working.
 */
export const HELIUS_RPS = 8
export const PUBLIC_RPS = 2

/** Provider ids, as they appear in `endpoint` results and throttle records. */
export type SolanaRpcProvider = 'helius' | 'solana-public'

/** Display names for the pane error banners. */
const PROVIDER_LABEL: Record<SolanaRpcProvider, string> = {
  helius: 'Helius',
  'solana-public': 'Solana public RPC',
}

export type SolanaRpcEndpoint = {
  /** Full URL, API key already embedded. See the `endpoint` handler comment. */
  url: string
  provider: SolanaRpcProvider
}

/**
 * A JSON-RPC `error` member, raised rather than returned.
 *
 * Carries the node's own code and message verbatim: `-32602` on a malformed
 * request is our bug, `-32005` (node behind) is theirs, and a pane that prints
 * one as the other sends the reader looking in the wrong place.
 */
export class SolanaRpcError extends Error {
  readonly __solanaRpcError = true
  readonly code: number
  readonly method: string

  constructor(method: string, code: number, message: string) {
    super(`Solana RPC ${method} failed (${code}): ${message}`)
    this.name = 'SolanaRpcError'
    this.code = code
    this.method = method
  }
}

/** True for a `SolanaRpcError`, robust across bundle copies. */
export function isSolanaRpcError(e: unknown): e is SolanaRpcError {
  return (
    e instanceof Error &&
    (e.name === 'SolanaRpcError' ||
      (e as Partial<SolanaRpcError>).__solanaRpcError === true)
  )
}

/**
 * Resolve the endpoint for a key, or the public node when there is none.
 *
 * The key is URL-encoded rather than trusted: it arrives from a config field a
 * user typed into, and an unescaped `&` there would silently turn the rest of
 * the key into a second query parameter.
 */
export function resolveEndpoint(apiKey: string | null): SolanaRpcEndpoint {
  const key = (apiKey ?? '').trim()
  if (key === '') {
    return { url: PUBLIC_SOLANA_RPC_URL, provider: 'solana-public' }
  }
  return {
    url: `${HELIUS_MAINNET_URL}?api-key=${encodeURIComponent(key)}`,
    provider: 'helius',
  }
}

/** The per-second budget for an endpoint, as a limiter. */
export function createEndpointLimiter(
  provider: SolanaRpcProvider,
): RequestLimiter {
  return createRequestLimiter({
    capacity: provider === 'helius' ? HELIUS_RPS : PUBLIC_RPS,
    windowMs: 1000,
  })
}

/** Shape a Solana node answers with. `result` and `error` are exclusive. */
type JsonRpcEnvelope = {
  result?: unknown
  error?: { code?: number; message?: string }
}

/**
 * One JSON-RPC call, paced and classified.
 *
 * 429 and 5xx become a `ProviderThrottledError` AND a recorded cool-off, which
 * is the pair that stops the terminal publishing "this venue carries nothing"
 * during a rate limit. A 401 is called what it is — a bad key is a setup
 * problem the user can fix, and burying it in a generic failure is how it stays
 * unfixed. The limiter is told about the cool-off too, so the queue behind this
 * call does not spend the next second re-triggering it.
 */
export async function solanaRpcCall(opts: {
  endpoint: SolanaRpcEndpoint
  limiter: RequestLimiter
  method: string
  params?: ReadonlyArray<unknown>
}): Promise<unknown> {
  const { endpoint, limiter, method } = opts
  const label = PROVIDER_LABEL[endpoint.provider]

  await limiter.acquire()
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: opts.params ?? [],
    }),
  })

  const throttled = providerThrottleFromResponse(response, label)
  if (throttled) {
    noteProviderThrottled(endpoint.provider, throttled.retryAfterMs)
    limiter.cooldown(throttled.retryAfterMs)
    throw throttled
  }
  if (response.status === 401 || response.status === 403) {
    // 403 is how the public node refuses a caller it has decided to shed, and
    // how Helius answers a revoked key. Both are cool-offs in practice, so the
    // window is extended before the message is raised.
    noteProviderThrottled(endpoint.provider, THROTTLE_COOLDOWN_MS)
    limiter.cooldown(THROTTLE_COOLDOWN_MS)
    throw new SolanaRpcError(
      method,
      response.status,
      endpoint.provider === 'helius'
        ? 'Helius rejected the API key'
        : 'The public Solana RPC refused the request',
    )
  }
  if (!response.ok) {
    throw new SolanaRpcError(
      method,
      response.status,
      `${label} answered HTTP ${response.status}`,
    )
  }

  const envelope = (await response.json()) as JsonRpcEnvelope
  if (envelope.error) {
    throw new SolanaRpcError(
      method,
      typeof envelope.error.code === 'number' ? envelope.error.code : -1,
      envelope.error.message ?? 'unspecified error',
    )
  }
  return envelope.result ?? null
}
