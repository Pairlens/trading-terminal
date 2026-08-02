// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Affiliate venue catalog
//
// Pairlens earns revenue by referring users who don't yet have an exchange or
// broker account. Referral URLs are NEVER baked into executables — the
// terminal resolves them at runtime from the App Server (`GET
// /api/affiliate-links`), which layers:
//
//   1. Public signup pages below (untagged fallback, works offline)
//   2. Pairlens' own affiliate links from env vars (AFFILIATE_LINK_<VENUE> /
//      AFFILIATE_LINKS_JSON)
//   3. A Pairlens affiliate's claimed venues (`?ref=<code>`), capped by tier
//
// SECURITY: Pairlens affiliates never supply URLs. Each venue declares a
// referral SCHEMA — named fields (usually just `code`, but e.g. Kraken needs
// `prefix` + `code`) with strict per-field patterns — and a URL template with
// one slot per field. URLs are built exclusively from the template, so an
// affiliate can never route users off-venue. Patterns must never admit
// characters that could escape a template slot (/, ?, #, &, %, .).
//
// Venue referral formats verified against official pages + multiple sources
// (2026-07). Venues with `referral: null` cannot be claimed by affiliates
// (no public code-based program) — Pairlens env links still cover them.
// ---------------------------------------------------------------------------

export type AffiliateVenueKind = 'cex' | 'broker'

export type ReferralField = {
  /** Slot name in the URL template, e.g. `code` → `{code}`. */
  key: string
  /** Form label for the link-builder UI ("Referral code", "Invite prefix"). */
  label: string
  /**
   * Strict shape of the venue-issued value. Charset-only validation: values
   * stay case-sensitive (Binance, Bitvavo, MEXC, Bitfinex all distinguish
   * case) — never lowercase on ingest.
   */
  pattern: RegExp
  /** Human hint for validation errors ("8–12 letters/digits"). */
  hint: string
  /** A realistically-shaped value, used in docs, previews, and tests. */
  example: string
}

export type VenueReferralSchema = {
  /** Trusted signup URL template with one `{key}` slot per field. */
  urlTemplate: string
  /** Fields the affiliate must provide, in link-builder display order. */
  fields: Array<ReferralField>
}

export type AffiliateVenue = {
  /** Matches the market connector id (CREDENTIAL_SCHEMAS key). */
  id: string
  label: string
  kind: AffiliateVenueKind
  /** Public account-creation page. Untagged fallback when nothing better resolves. */
  signupUrl: string
  /** Referral link schema, or null if the venue has no program we can route. */
  referral: VenueReferralSchema | null
}

/** Most venues take exactly one venue-issued code. */
const codeField = (
  pattern: RegExp,
  hint: string,
  example: string,
): Array<ReferralField> => [
  { key: 'code', label: 'Referral code', pattern, hint, example },
]

export const AFFILIATE_VENUES: Array<AffiliateVenue> = [
  {
    id: 'okx',
    label: 'OKX',
    kind: 'cex',
    signupUrl: 'https://www.okx.com/account/register',
    referral: {
      urlTemplate: 'https://www.okx.com/join/{code}',
      fields: codeField(
        /^[A-Za-z0-9]{4,16}$/,
        '4–16 letters/digits (default codes are 8 digits)',
        '47447298',
      ),
    },
  },
  {
    id: 'binance',
    label: 'Binance',
    kind: 'cex',
    signupUrl: 'https://accounts.binance.com/register',
    referral: {
      urlTemplate: 'https://accounts.binance.com/register?ref={code}',
      fields: codeField(
        /^[A-Za-z0-9]{5,12}$/,
        '5–12 letters/digits (case-sensitive)',
        'RSKXSP66',
      ),
    },
  },
  {
    id: 'bybit',
    label: 'ByBit',
    kind: 'cex',
    signupUrl: 'https://www.bybit.com/register',
    // TODO(manual check): codes verified, but no fetched source printed the
    // exact invite URL — click through a real referral link once before the
    // affiliate link builder ships.
    referral: {
      urlTemplate: 'https://www.bybit.com/invite?ref={code}',
      fields: codeField(/^[A-Za-z0-9]{4,16}$/, '4–16 letters/digits', '45599'),
    },
  },
  {
    id: 'bitvavo',
    label: 'Bitvavo',
    kind: 'cex',
    signupUrl: 'https://account.bitvavo.com/create',
    referral: {
      urlTemplate: 'https://account.bitvavo.com/create?a={code}',
      fields: codeField(
        /^[A-Za-z0-9]{4,16}$/,
        '4–16 letters/digits (case-sensitive)',
        'Renetoday',
      ),
    },
  },
  {
    id: 'mexc',
    label: 'MEXC',
    kind: 'cex',
    signupUrl: 'https://www.mexc.com/register',
    referral: {
      urlTemplate: 'https://www.mexc.com/register?inviteCode={code}',
      fields: codeField(
        /^(?:mexc-)?[A-Za-z0-9]{4,12}$/,
        '4–12 letters/digits, optionally prefixed "mexc-"',
        'mexc-MXUSDT',
      ),
    },
  },
  {
    id: 'kucoin',
    label: 'KuCoin',
    kind: 'cex',
    signupUrl: 'https://www.kucoin.com/ucenter/signup',
    // /r/rf/ is refer-a-friend; /r/af/ is the affiliate-network variant.
    referral: {
      urlTemplate: 'https://www.kucoin.com/r/rf/{code}',
      fields: codeField(
        /^[A-Za-z0-9]{5,10}$/,
        '5–10 letters/digits',
        'QBAY1X4K',
      ),
    },
  },
  {
    id: 'gate',
    label: 'Gate',
    kind: 'cex',
    signupUrl: 'https://www.gate.com/signup',
    referral: {
      urlTemplate: 'https://www.gate.com/signup/{code}',
      fields: codeField(
        /^[A-Za-z0-9_]{3,12}$/,
        '3–12 letters/digits/underscores',
        'VLEWAV0NVQ',
      ),
    },
  },
  {
    id: 'bitget',
    label: 'Bitget',
    kind: 'cex',
    signupUrl: 'https://www.bitget.com/register',
    // TODO(manual check): clacCode param matches the documented RAF landing
    // but wasn't printed verbatim by any fetched source — verify once.
    referral: {
      urlTemplate:
        'https://www.bitget.com/referral/register?clacCode={code}&from=referral',
      fields: codeField(/^[A-Za-z0-9]{3,10}$/, '3–10 letters/digits', 'ew9a68'),
    },
  },
  {
    id: 'coinbase',
    label: 'Coinbase',
    kind: 'cex',
    signupUrl: 'https://www.coinbase.com/signup',
    // TODO(manual check): long-standing /join/ RAF path — verify once with a
    // live referral link.
    referral: {
      urlTemplate: 'https://www.coinbase.com/join/{code}',
      fields: codeField(
        /^[a-z0-9_]{4,24}$/,
        '4–24 lowercase letters/digits/underscores',
        'smith_x7',
      ),
    },
  },
  {
    id: 'kraken',
    label: 'Kraken',
    kind: 'cex',
    signupUrl: 'https://www.kraken.com/sign-up',
    // Kraken invite links carry two path segments — exactly why referral
    // schemas are per-venue field lists instead of a single code.
    referral: {
      urlTemplate: 'https://invite.kraken.com/{prefix}/{code}',
      fields: [
        {
          key: 'prefix',
          label: 'Invite prefix',
          pattern: /^[A-Z0-9]{2,6}$/,
          hint: '2–6 uppercase letters/digits (first invite-link segment)',
          example: 'JDNW',
        },
        {
          key: 'code',
          label: 'Invite code',
          pattern: /^[a-z0-9]{6,10}$/,
          hint: '6–10 lowercase letters/digits (second invite-link segment)',
          example: 'geaibzr6',
        },
      ],
    },
  },
  {
    id: 'htx',
    label: 'HTX',
    kind: 'cex',
    signupUrl: 'https://www.htx.com/register',
    referral: {
      urlTemplate: 'https://www.htx.com/invite/en-us/1f?invite_code={code}',
      fields: codeField(
        /^[a-z0-9]{4,10}$/,
        '4–10 lowercase letters/digits',
        'zmkq8223',
      ),
    },
  },
  {
    id: 'cryptocom',
    label: 'Crypto.com',
    kind: 'cex',
    signupUrl: 'https://crypto.com/exchange/register',
    // Exchange program only — the Crypto.com APP uses crypto.com/app/{code}
    // and codes are NOT cross-valid between the two.
    referral: {
      urlTemplate: 'https://crypto.com/exch/{code}',
      fields: codeField(
        /^[a-z0-9]{6,12}$/,
        '6–12 lowercase letters/digits',
        'bveapsxjw7',
      ),
    },
  },
  {
    id: 'bitfinex',
    label: 'Bitfinex',
    kind: 'cex',
    signupUrl: 'https://www.bitfinex.com/sign-up',
    referral: {
      urlTemplate: 'https://www.bitfinex.com/sign-up?refcode={code}',
      fields: codeField(
        /^[A-Za-z0-9]{6,12}$/,
        '6–12 letters/digits (case-sensitive)',
        'C2nM6IO5b',
      ),
    },
  },
  {
    id: 'upbit',
    label: 'Upbit',
    kind: 'cex',
    signupUrl: 'https://upbit.com/signup',
    // No permanent public referral program (occasional KR-only campaigns).
    referral: null,
  },
  {
    id: 'alpaca',
    label: 'Alpaca',
    kind: 'broker',
    signupUrl: 'https://app.alpaca.markets/signup',
    // Retail invite program uses system-generated tracked links only — no
    // stable field→URL format to build from.
    referral: null,
  },
]

export const AFFILIATE_VENUE_MAP: Record<string, AffiliateVenue> =
  Object.fromEntries(AFFILIATE_VENUES.map((v) => [v.id, v]))

// ---------------------------------------------------------------------------
// Affiliate tiers — how many venues an affiliate may claim with their own
// referral codes. Unclaimed venues fall back to Pairlens' links.
// ---------------------------------------------------------------------------

export type AffiliateTier = 'bronze' | 'silver' | 'gold'

export const AFFILIATE_TIER_LIMITS: Record<AffiliateTier, number> = {
  bronze: 2,
  silver: 5,
  gold: 10,
}

/** Pairlens referral codes (`?ref=`): lowercase slug, 3-32 chars. */
export const AFFILIATE_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/

// ---------------------------------------------------------------------------
// Link resolution types (shared between App Server response and terminal)
// ---------------------------------------------------------------------------

/** Who a resolved signup link is attributed to. */
export type AffiliateLinkSource = 'default' | 'pairlens' | 'affiliate'

export type ResolvedAffiliateLink = {
  venue: string
  url: string
  source: AffiliateLinkSource
}

export type AffiliateLinksResponse = {
  /** The referral code that was honored, or null if absent/invalid. */
  ref: string | null
  links: Record<string, ResolvedAffiliateLink>
}

/** Venue-issued referral values keyed by schema field, e.g. { code: '…' }. */
export type ReferralParams = Record<string, string>

export type ReferralValidation = { ok: true } | { ok: false; error: string }

/**
 * Validates referral params against the venue's schema: every declared field
 * present and matching its pattern, and no undeclared keys smuggled in.
 */
export function validateReferralParams(
  venueId: string,
  params: ReferralParams,
): ReferralValidation {
  const venue = AFFILIATE_VENUE_MAP[venueId]
  if (!venue) return { ok: false, error: `Unknown venue: ${venueId}` }
  if (!venue.referral) {
    return {
      ok: false,
      error: `${venue.label} has no referral program Pairlens can route to`,
    }
  }
  const declared = new Set(venue.referral.fields.map((f) => f.key))
  for (const key of Object.keys(params)) {
    if (!declared.has(key)) {
      return {
        ok: false,
        error: `Unexpected field "${key}" for ${venue.label}`,
      }
    }
  }
  for (const field of venue.referral.fields) {
    const value = params[field.key]
    if (value === undefined || value === '') {
      return {
        ok: false,
        error: `Missing ${venue.label} ${field.label.toLowerCase()}`,
      }
    }
    if (!field.pattern.test(value)) {
      return {
        ok: false,
        error: `Invalid ${venue.label} ${field.label.toLowerCase()} — expected ${field.hint}`,
      }
    }
  }
  return { ok: true }
}

/**
 * Builds the venue signup URL from validated referral params, or null when
 * the venue has no program or any field fails its pattern. Templates fix the
 * host and field patterns exclude every URL metacharacter, so the result can
 * never leave the venue.
 */
export function buildAffiliateVenueUrl(
  venueId: string,
  params: ReferralParams,
): string | null {
  const referral = AFFILIATE_VENUE_MAP[venueId]?.referral
  if (!referral || !validateReferralParams(venueId, params).ok) return null
  let url = referral.urlTemplate
  for (const field of referral.fields) {
    url = url.replace(`{${field.key}}`, encodeURIComponent(params[field.key]))
  }
  return url
}

/** Example params for a venue's schema (docs, previews, tests). */
export function exampleReferralParams(venueId: string): ReferralParams {
  const referral = AFFILIATE_VENUE_MAP[venueId]?.referral
  if (!referral) return {}
  return Object.fromEntries(referral.fields.map((f) => [f.key, f.example]))
}

/** Untagged catalog defaults — the terminal's offline/fetch-failed fallback. */
export function defaultAffiliateLinks(): Record<string, ResolvedAffiliateLink> {
  return Object.fromEntries(
    AFFILIATE_VENUES.map((v) => [
      v.id,
      { venue: v.id, url: v.signupUrl, source: 'default' as const },
    ]),
  )
}
