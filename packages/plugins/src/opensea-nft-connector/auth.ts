// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the OpenSea key comes from, and why a user does not have to bring one.
 *
 * OpenSea publishes a documented, unauthenticated way to mint a free-tier key:
 * `POST /auth/keys` with no body, no signup, no wallet, no human. It answers
 * with a key, an expiry seven days out and the rate limits attached to it. That
 * endpoint reflects the request origin, so a browser can call it, which is what
 * makes it usable from the hosted terminal and the phone rather than only from
 * a build with a secret baked in.
 *
 * So the NFT boards no longer open on a wall. A user who has never heard of
 * OpenSea gets rankings, the ladder and the tape; a user who wants the higher
 * throughput of a full key pastes one on the plugin and it wins from then on.
 *
 * ## Precedence, and what "stopped working" means
 *
 * The user's own key is always preferred. An auto key is only reached for when
 * there is no user key, or when the user's key is REJECTED (401/403: revoked,
 * mistyped, or expired). A rejection is remembered for the session so every
 * later read goes straight to the auto key instead of spending a request
 * proving the same thing again, and it is forgotten the moment the user edits
 * the field, because a new key deserves a fresh try.
 *
 * ## Minting is rationed, and that is not a detail
 *
 * Key creation is rate limited PER IP, and the ceiling is low: OpenSea answers
 * a third attempt in a day with `429 Maximum 2 keys per day`. Its own guidance
 * is also explicit that minting extra keys is not a way to buy throughput. Two
 * a day is the number every decision below is sized against, because burning
 * both leaves a user with no key at all, which is worse than where they
 * started. So a key is minted at most once and then reused:
 *
 * - **Single flight.** A cold NFT board fires about twenty reads at once with
 *   nothing cached. They collapse onto one mint, not twenty.
 * - **Persisted.** The key outlives the tab. Re-minting on every reload would
 *   walk into the creation limit within a few refreshes and leave the user
 *   with no key at all, which is worse than where they started.
 * - **Backed off.** A failed mint blocks the next attempt, and a 429 blocks it
 *   for exactly as long as the response asks. The cool-off is persisted too:
 *   a reload is the most likely thing to happen right after a failure, and a
 *   cool-off that a reload clears is not a cool-off.
 * - **Never discarded on an ambiguous signal.** Only a 401 retires a key. A 403
 *   can be a geo block, a WAF or an endpoint the free tier does not carry, and
 *   throwing a working key away over one of those would spend a mint to fix a
 *   problem a new key does not fix. See the 401 branch in `./http`.
 * - **Floored and capped.** Single flight only collapses the reads in flight
 *   TOGETHER. A board loads in waves, so if a key is rejected every wave mints
 *   again: measured in the browser, one board burned three keys in eighteen
 *   seconds, which is a whole day's budget and then some. Two limits close
 *   that. A minute must pass between mints, which folds a board's waves into
 *   one; and no more than two succeed in a rolling day, which is the venue's
 *   own cap enforced on our side so a loop can never reach it.
 *
 * Two a day is per ADDRESS, so a shared or corporate network can genuinely run
 * out. That is the one case that still surfaces the connector's typed "add a
 * key" refusal, and the CoinGecko fallback still answers collection state
 * underneath it.
 *
 * ## Where the key is kept, and why not the vault
 *
 * Plain `localStorage`, alongside the plugin ledger's own config rather than
 * inside the credential vault. This key is not the user's and not a trading
 * credential: it is anonymous, free-tier, expires in a week, and cannot move an
 * asset (signing an order needs the wallet, which is vaulted and stays that
 * way). Putting it behind the vault would also defeat the point, since
 * enrolling a vault protector is exactly the onboarding step this removes.
 * A browser that refuses storage still works; it mints once per session.
 */
import { restFetch } from '@pairlens/market-engine/http'

import { OPENSEA_API_BASE } from './endpoints'

const MINT_URL = `${OPENSEA_API_BASE}/auth/keys`

const STORAGE_KEY = 'pairlens:opensea-auto-key'

/**
 * Re-mint this long before OpenSea's own expiry.
 *
 * A key that dies mid-board costs a round trip and a retry on every pane at
 * once. An hour of headroom on a seven-day life is free.
 */
const EXPIRY_MARGIN_MS = 3_600_000

/**
 * Assumed life for a key that arrives without a readable expiry.
 *
 * Just under the seven days OpenSea documents, rather than something cautious
 * like a day. Guessing SHORT is the expensive mistake here: it re-mints against
 * a two-a-day ceiling on a key that was probably still fine. Guessing long is
 * self-correcting, because the 401 that a truly dead key returns retires it.
 */
const DEFAULT_TTL_MS = 6 * 86_400_000

/** How long a failed mint blocks the next one, absent the venue's own advice. */
const FAILURE_BACKOFF_MS = 300_000

/**
 * The floor between two mints.
 *
 * A key legitimately needs replacing about once a week. Anything asking for a
 * second one within a minute is a rejection loop, not a renewal, and the wait
 * is what turns a board's successive waves of panes into a single attempt.
 */
const MIN_MINT_INTERVAL_MS = 60_000

/**
 * Mints allowed in a rolling day, and the window it rolls over.
 *
 * OpenSea's own number, from the body it sends on refusal: `Maximum 2 keys per
 * day`. Enforced here as well so a loop is stopped by us before it is stopped
 * by them. Being wrong in the conservative direction costs nothing, since the
 * key from the mint we did make is still in hand; being wrong the other way
 * spends the day's budget and leaves the user with none.
 */
const MINT_DAILY_CAP = 2
const MINT_WINDOW_MS = 86_400_000

/** The longest a `retry-after` may park us. Beyond this, ask again sooner. */
const MAX_BACKOFF_MS = 21_600_000

type AutoKey = { key: string; expiresAt: number }

type Persisted = {
  key?: unknown
  expiresAt?: unknown
  blockedUntil?: unknown
  mints?: unknown
}

let userKey = ''
let userKeyRejected = false
let auto: AutoKey | null = null
let blockedUntil = 0
/** When each recent mint succeeded, newest last, pruned to the rolling window. */
let mints: Array<number> = []
let inFlight: Promise<string | null> | null = null
let loaded = false

function storage(): Storage | null {
  try {
    // Absent in a worker and in the CLI, and a browser with site data blocked
    // throws on the ACCESS rather than on the read.
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Read the persisted key and cool-off once per module life. */
function load(): void {
  if (loaded) return
  loaded = true
  const store = storage()
  if (!store) return
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Persisted
    if (typeof parsed.blockedUntil === 'number') {
      blockedUntil = parsed.blockedUntil
    }
    if (Array.isArray(parsed.mints)) {
      mints = parsed.mints.filter((t): t is number => typeof t === 'number')
    }
    if (
      typeof parsed.key === 'string' &&
      parsed.key !== '' &&
      typeof parsed.expiresAt === 'number'
    ) {
      auto = { key: parsed.key, expiresAt: parsed.expiresAt }
    }
  } catch {
    // Unreadable is the same as absent: mint a new one.
  }
}

function save(): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...(auto ? { key: auto.key, expiresAt: auto.expiresAt } : {}),
        blockedUntil,
        mints,
      }),
    )
  } catch {
    // A full or refusing store just means the key lives for this session.
  }
}

function block(ms: number): void {
  blockUntil(Date.now() + Math.min(Math.max(ms, 0), MAX_BACKOFF_MS))
}

function blockUntil(timestamp: number): void {
  blockedUntil = Math.max(blockedUntil, timestamp)
  save()
}

/** Recent mints, oldest first, with anything outside the window dropped. */
function recentMints(now: number): Array<number> {
  mints = mints.filter((t) => t > now - MINT_WINDOW_MS).sort((a, b) => a - b)
  return mints
}

/**
 * Why we may not mint right now, or null to go ahead.
 *
 * Both answers park the next attempt rather than merely declining this one, so
 * a board that keeps asking does not keep arriving here.
 */
function mintBarrier(now: number): 'blocked' | 'capped' | 'too-soon' | null {
  if (now < blockedUntil) return 'blocked'
  const recent = recentMints(now)
  if (recent.length >= MINT_DAILY_CAP) {
    // Wait for the oldest to leave the window, which is when the venue's own
    // counter would let another through.
    blockUntil(recent[0] + MINT_WINDOW_MS)
    return 'capped'
  }
  const last = recent[recent.length - 1]
  if (last !== undefined && now - last < MIN_MINT_INTERVAL_MS) {
    blockUntil(last + MIN_MINT_INTERVAL_MS)
    return 'too-soon'
  }
  return null
}

function usable(candidate: AutoKey): boolean {
  return candidate.expiresAt - EXPIRY_MARGIN_MS > Date.now()
}

/** `retry-after` in seconds, as OpenSea sends it on a creation throttle. */
function retryAfterMs(response: Response): number {
  const header = response.headers.get('retry-after')
  const seconds = header ? Number(header) : Number.NaN
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : FAILURE_BACKOFF_MS
}

function readMinted(body: unknown): AutoKey | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  const key = record['api_key']
  if (typeof key !== 'string' || key.trim() === '') return null
  const expiry = record['expires_at']
  const parsed = typeof expiry === 'string' ? Date.parse(expiry) : Number.NaN
  return {
    key: key.trim(),
    expiresAt: Number.isFinite(parsed) ? parsed : Date.now() + DEFAULT_TTL_MS,
  }
}

/**
 * One mint attempt, or null with a cool-off recorded.
 *
 * Never throws. A caller that cannot get a key turns that into the connector's
 * own typed refusal, which is the one the panes know how to render.
 */
async function mint(): Promise<string | null> {
  if (mintBarrier(Date.now()) !== null) return null

  let response: Response
  try {
    response = await restFetch(MINT_URL, {
      method: 'POST',
      headers: { accept: 'application/json' },
    })
  } catch {
    block(FAILURE_BACKOFF_MS)
    return null
  }

  if (!response.ok) {
    block(response.status === 429 ? retryAfterMs(response) : FAILURE_BACKOFF_MS)
    return null
  }

  let minted: AutoKey | null
  try {
    minted = readMinted(await response.json())
  } catch {
    minted = null
  }
  if (!minted) {
    block(FAILURE_BACKOFF_MS)
    return null
  }

  auto = minted
  blockedUntil = 0
  mints = [...recentMints(Date.now()), Date.now()]
  save()
  return minted.key
}

/** Every concurrent caller waits on the same attempt. */
function mintOnce(): Promise<string | null> {
  if (inFlight) return inFlight
  const attempt = mint().finally(() => {
    if (inFlight === attempt) inFlight = null
  })
  inFlight = attempt
  return attempt
}

/**
 * The key to send, or null when there is none to be had right now.
 *
 * Null is a real answer here and the caller must not paper over it: it means
 * the user has no key AND we are inside a mint cool-off, which is the one
 * state where the board genuinely needs a human to paste something.
 */
export async function resolveKey(): Promise<string | null> {
  load()
  if (userKey && !userKeyRejected) return userKey
  if (auto && usable(auto)) return auto.key
  return mintOnce()
}

/**
 * A key just came back rejected. Retire it and answer with its replacement.
 *
 * Returns null when there is nothing else to try, which is what turns into the
 * connector's "add a key" refusal. A replacement equal to what was rejected is
 * reported as null too, so a caller can never retry the same key forever.
 */
export async function replaceRejectedKey(
  rejected: string,
): Promise<string | null> {
  load()
  if (userKey && rejected === userKey) {
    userKeyRejected = true
  } else if (auto && auto.key === rejected) {
    auto = null
    save()
  }
  const next = await resolveKey()
  return next && next !== rejected ? next : null
}

/**
 * The user's own key, from plugin config.
 *
 * Editing it clears the rejection: the whole point of pasting a new key is to
 * be tried again.
 */
export function setUserKey(key: string | undefined): void {
  const next = typeof key === 'string' ? key.trim() : ''
  if (next === userKey) return
  userKey = next
  userKeyRejected = false
}

/**
 * Test seam. Drops every trace, persisted included, so one test's minted key
 * cannot answer the next test's read.
 */
export function resetAuth(): void {
  userKey = ''
  userKeyRejected = false
  auto = null
  blockedUntil = 0
  mints = []
  inFlight = null
  loaded = false
  const store = storage()
  try {
    store?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to drop.
  }
}
