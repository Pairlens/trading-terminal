// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Qualified instrument identity: what asset, and whose tape.
 *
 * The terminal used to carry one unqualified string ("BTC-USDT") and rebuild
 * the missing half at render time from `terminal.market`, a single global venue
 * preference, in six different components. When that preference did not serve
 * the symbol's asset class the terminal rendered a price from the wrong venue
 * instead of refusing: 'BTC-USDT' routed to Alpaca, whose base leg 'BTC' is a
 * real NYSE Arca spot-bitcoin ETF, and a ~$28 equity price appeared under a
 * crypto pair's label.
 *
 * Two types, because the app genuinely means two different things:
 *
 * - `InstrumentRef` — WHAT asset. "I am watching BTC" does not name a venue.
 * - `MarketRef` — WHOSE tape and whose book. A chart is always of one venue,
 *   and so is an order.
 *
 * Resolution between them is explicit and happens once, at navigation time
 * (see the terminal's `resolveMarketRef`), never implicitly at render.
 *
 * Some arms bind their venue as part of identity and skip resolution entirely:
 * a token IS its chain plus address, and a prediction outcome IS its venue plus
 * market id. For those two the ref types coincide.
 */

/**
 * The URL-facing asset-class slug. A third naming of an axis the codebase
 * already spells two other ways (`AssetClass` on the connector,
 * `InstrumentKind` on the instrument), chosen because the URL is a public
 * surface and `/crypto-spot/okx/BTC-USDT` is not a URL anyone wants to read.
 * `normalizeInstrumentClass` is the single table that keeps all three in step.
 */
export type InstrumentClass = 'spot' | 'perp' | 'dex' | 'stocks' | 'prediction'

export const INSTRUMENT_CLASSES: ReadonlyArray<InstrumentClass> = [
  'spot',
  'perp',
  'dex',
  'stocks',
  'prediction',
]

/**
 * Classes whose venue is part of the instrument's identity rather than a
 * routing choice. A token on Base and the same address on Arbitrum are two
 * different assets; BTC-USDT on OKX and on Gate are one asset on two tapes.
 */
const VENUE_BOUND: ReadonlyArray<InstrumentClass> = ['dex', 'prediction']

export function isVenueBoundClass(cls: InstrumentClass): boolean {
  return VENUE_BOUND.includes(cls)
}

/** What asset, independent of who lists it. */
export type InstrumentRef = {
  cls: InstrumentClass
  /**
   * Present exactly when `isVenueBoundClass(cls)`: the chain for a token, the
   * venue for a prediction outcome. Absent otherwise, and absent is meaningful
   * (it is not "unknown venue", it is "venue is not part of this identity").
   */
  market?: string
  id: string
}

/** What asset, on which venue. What a chart and an order both need. */
export type MarketRef = {
  cls: InstrumentClass
  market: string
  id: string
}

// ── Class normalization ──────────────────────────────────────────────
//
// Three vocabularies reach this function and they do not agree. The
// instruments index and the plugin catalog emit `assetClass: 'crypto'`; the
// CEX connectors emit `'crypto-spot'` from the same field. That drift is why
// `markets.assetClasses.includes(assetClass)` silently never matched for
// crypto, so the mobile shell's asset-class correction could not move a crypto
// pair off a stock venue. Everything funnels through here now.

const CLASS_ALIASES: Readonly<Record<string, InstrumentClass>> = {
  // URL slugs (identity)
  spot: 'spot',
  perp: 'perp',
  dex: 'dex',
  stocks: 'stocks',
  prediction: 'prediction',
  // AssetClass, as connectors declare it
  'crypto-spot': 'spot',
  'crypto-perp': 'perp',
  // InstrumentKind, as the discovery arms name it
  'cex-pair': 'spot',
  'cex-derivative': 'perp',
  token: 'dex',
  equity: 'stocks',
  // Drifted spellings seen in the wild
  crypto: 'spot',
  equities: 'stocks',
  stock: 'stocks',
}

/** The class a raw asset-class/kind string names, or undefined if unknown. */
export function normalizeInstrumentClass(
  raw: string | undefined | null,
): InstrumentClass | undefined {
  if (!raw) return undefined
  return CLASS_ALIASES[raw.trim().toLowerCase()]
}

/**
 * Whether a venue serves a class, normalizing BOTH sides. Callers hold
 * `MarketAdapterInfo.assetClasses`, which is `AssetClass[]`, and comparing it
 * to a slug without normalizing is the exact bug described above.
 */
export function marketServesClass(
  assetClasses: ReadonlyArray<string>,
  cls: InstrumentClass,
): boolean {
  return assetClasses.some((a) => normalizeInstrumentClass(a) === cls)
}

// ── Id normalization ─────────────────────────────────────────────────

/** True if the string looks like an EVM contract address. */
export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

/**
 * True if the string looks like a Solana mint address (base58, 32-44 chars).
 * Short uppercase tickers are excluded by the length floor.
 */
export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

/** True if the string looks like a token address on any supported chain. */
export function isTokenAddress(value: string): boolean {
  return isEvmAddress(value) || isSolanaAddress(value)
}

/**
 * Canonicalize an id WITHIN its class. This is per-class on purpose: the
 * uppercase-everything rule that is correct for `btc/usdt` destroys a token
 * address. Base58 is case-sensitive, so upper-casing a Solana mint yields a
 * different (usually nonexistent) mint, and an EVM address loses its checksum
 * casing. Getting this wrong points the chart at nothing at best, and at a
 * different token at worst.
 */
export function normalizeInstrumentId(
  cls: InstrumentClass,
  raw: string,
): string {
  const trimmed = raw.trim()
  if (cls === 'prediction') return trimmed
  if (cls === 'dex') {
    // A dex id is `base-quote` where the base is normally an ADDRESS, so the
    // two legs cannot share one rule. Separators are canonicalized first,
    // which is safe because no address of either chain contains one, then the
    // split is on the LAST one: the quote is always a plain ticker.
    const dashed = trimmed.replace(/[/_]/g, '-')
    const at = dashed.lastIndexOf('-')
    const base = at === -1 ? dashed : dashed.slice(0, at)
    const quote = at === -1 ? '' : dashed.slice(at + 1)
    const normalizedBase = isEvmAddress(base)
      ? base.toLowerCase()
      : isSolanaAddress(base)
        ? base
        : base.toUpperCase()
    return quote ? `${normalizedBase}-${quote.toUpperCase()}` : normalizedBase
  }
  return trimmed.toUpperCase().replace(/[/_]/g, '-')
}

// ── Serialization ────────────────────────────────────────────────────
//
// One grammar, two renderings:
//
//   storage/key   spot:okx:BTC-USDT      dex:base:0xabc…      stocks:alpaca:AAPL
//   URL path      /spot/okx/BTC-USDT     /dex/base/0xabc…     /stocks/alpaca/AAPL
//
// The id segment is always last and may itself contain the separator, which is
// how the prediction arm carries `marketId~outcome` without a fourth segment.
// Parsers therefore split with a limit and keep the remainder whole.

const SEP = ':'

/** `spot:okx:BTC-USDT`. Stable across reloads; safe as a storage key. */
export function formatMarketRef(ref: MarketRef): string {
  return `${ref.cls}${SEP}${ref.market}${SEP}${ref.id}`
}

/**
 * Drop the venue from a market ref, unless the venue is part of identity.
 *
 * What a watchlist stores: "I am watching BTC" does not name a venue, so
 * charting BTC-USDT on Binance and on OKX must light the same star. Formatting
 * a `MarketRef` directly gives `spot:binance:BTC-USDT`, which matches nothing
 * a watchlist ever wrote.
 */
export function toWatchlistRef(ref: MarketRef): InstrumentRef {
  return isVenueBoundClass(ref.cls)
    ? { cls: ref.cls, market: ref.market, id: ref.id }
    : { cls: ref.cls, id: ref.id }
}

/** `spot:BTC-USDT`, or `dex:base:0xabc…` for the venue-bound arms. */
export function formatInstrumentRef(ref: InstrumentRef): string {
  return ref.market
    ? `${ref.cls}${SEP}${ref.market}${SEP}${ref.id}`
    : `${ref.cls}${SEP}${ref.id}`
}

function splitOnce(value: string): [string, string] | null {
  const at = value.indexOf(SEP)
  if (at <= 0 || at === value.length - 1) return null
  return [value.slice(0, at), value.slice(at + 1)]
}

export function parseMarketRef(value: string): MarketRef | null {
  const head = splitOnce(value)
  if (!head) return null
  const cls = normalizeInstrumentClass(head[0])
  if (!cls) return null
  const rest = splitOnce(head[1])
  if (!rest) return null
  const [market, id] = rest
  if (!market || !id) return null
  return {
    cls,
    market: market.toLowerCase(),
    id: normalizeInstrumentId(cls, id),
  }
}

export function parseInstrumentRef(value: string): InstrumentRef | null {
  const head = splitOnce(value)
  if (!head) return null
  const cls = normalizeInstrumentClass(head[0])
  if (!cls) return null
  if (isVenueBoundClass(cls)) {
    const rest = splitOnce(head[1])
    if (!rest) return null
    const [market, id] = rest
    if (!market || !id) return null
    return {
      cls,
      market: market.toLowerCase(),
      id: normalizeInstrumentId(cls, id),
    }
  }
  return { cls, id: normalizeInstrumentId(cls, head[1]) }
}

// ── URL paths ────────────────────────────────────────────────────────

/** `/spot/okx/BTC-USDT`. The canonical chart route for a market ref. */
export function marketRefToPath(ref: MarketRef): string {
  return `/${ref.cls}/${encodeURIComponent(ref.market)}/${encodeURIComponent(ref.id)}`
}

/**
 * Read a market ref back out of a pathname. Returns null for any path that is
 * not a chart route, which is what callers use to tell "this is a pair page"
 * from "this is /accounts".
 */
export function parseMarketRefPath(pathname: string): MarketRef | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 3) return null
  const cls = normalizeInstrumentClass(decodeSafe(parts[0]))
  if (!cls) return null
  const market = decodeSafe(parts[1]).toLowerCase()
  const id = decodeSafe(parts[2])
  if (!market || !id) return null
  return { cls, market, id: normalizeInstrumentId(cls, id) }
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// ── Instrument → refs ────────────────────────────────────────────────

/** The venue-free identity of an instrument-shaped row. */
export function toInstrumentRef(inst: {
  kind: string
  symbol: string
  market: string
  quote?: string
  chain?: string
  address?: string
  settle?: string
  contract?: string
  mic?: string
  predictionMarketId?: string
  outcome?: string
}): InstrumentRef | null {
  const cls = normalizeInstrumentClass(inst.kind)
  if (!cls) return null
  switch (cls) {
    case 'dex': {
      if (!inst.chain || !inst.address) return null
      // The quote leg rides along because the pool resolvers need it: they
      // split the pair key and look for a pool pairing this token against
      // that quote. The BASE is the address, which is the identity.
      const quote = inst.quote?.trim() ? inst.quote.trim() : 'USDC'
      return {
        cls,
        market: inst.chain.toLowerCase(),
        id: normalizeInstrumentId(cls, `${inst.address}-${quote}`),
      }
    }
    case 'prediction':
      // Venue-bound like a token, but keyed by the CONNECTOR's own pair key
      // rather than by `marketId + outcome`. Those two are the catalog's
      // identity for dedupe; the id here is what gets handed to a subscribe,
      // and prediction keys are already scoped per venue. Requiring the
      // triple is still right for `instrumentIdentityKey`, which is asking a
      // different question.
      if (!inst.market || !inst.symbol) return null
      return {
        cls,
        market: inst.market.toLowerCase(),
        id: normalizeInstrumentId(cls, inst.symbol),
      }
    case 'perp':
      // ccxt's unified scheme distinguishes the linear perp from spot by its
      // settle currency ('BTC/USDT:USDT'). Carry it only when it differs from
      // the quote, which is the inverse-perp case; for a linear perp it is
      // redundant and just makes the URL longer.
      return {
        cls,
        id: normalizeInstrumentId(
          cls,
          inst.settle && !inst.symbol.endsWith(`-${inst.settle}`)
            ? `${inst.symbol}-${inst.settle}`
            : inst.symbol,
        ),
      }
    default:
      return { cls, id: normalizeInstrumentId(cls, inst.symbol) }
  }
}
