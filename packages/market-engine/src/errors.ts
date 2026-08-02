// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Typed connector errors shared across all market connectors.
 *
 * These are constructed inside connector packages but inspected in the
 * terminal, which may load a *different* bundled copy of this module. So the
 * type guards key off a stable `name` string rather than `instanceof`, which
 * is unreliable across module/bundle boundaries.
 */

/**
 * The exchange has refused service for the user's region — either because we
 * statically know the venue is unavailable there (e.g. ByBit in the US) or
 * because the exchange returned a geo-block HTTP status (451, or 403 with
 * body evidence of a geo block).
 */
export class GeoRestrictedError extends Error {
  /** Sentinel for the cross-bundle type guard (survives name mangling). */
  readonly __geoRestricted = true
  readonly exchange: string
  /** User's selected ISO country code, or '' if they haven't set one. */
  readonly region: string
  /** HTTP status that triggered detection, when reactive (451 or 403). */
  readonly status?: number

  constructor(exchange: string, region: string, status?: number) {
    super(
      `${exchange} is not available in your region${
        region ? ` (${region})` : ''
      }`,
    )
    this.name = 'GeoRestrictedError'
    this.exchange = exchange
    this.region = region
    this.status = status
  }
}

/** True when `e` is a GeoRestrictedError (robust across bundle boundaries). */
export function isGeoRestrictedError(e: unknown): e is GeoRestrictedError {
  return (
    e instanceof Error &&
    (e.name === 'GeoRestrictedError' ||
      (e as Partial<GeoRestrictedError>).__geoRestricted === true)
  )
}

/** Substrings exchanges use in geo-block response bodies (case-insensitive). */
const GEO_BLOCK_MARKERS = [
  'restricted',
  'region',
  'country',
  'location',
  'unavailable in your',
]

function bodyIndicatesGeoBlock(body: string): boolean {
  const lower = body.toLowerCase()
  return GEO_BLOCK_MARKERS.some((marker) => lower.includes(marker))
}

/**
 * Assert a fetch Response is OK, throwing a typed error otherwise.
 *
 * - 451 (Unavailable For Legal Reasons) is unambiguous → GeoRestrictedError
 *   so the UI can surface a region-aware dialog.
 * - 403 (Forbidden) is ambiguous — exchanges also use it for revoked API
 *   keys and WAF/rate-limit bans. Only classify it as a geo block when the
 *   response body (optional, best-effort) contains a known geo-block marker.
 * - Any other non-2xx (and 403 without body evidence) → a generic Error with
 *   the status, preserving today's message shape
 *   (`"<Exchange> REST error: <status>"`).
 */
export function assertResponseOk(
  resp: { ok: boolean; status: number },
  exchange: string,
  region: string,
  body?: string,
): void {
  if (resp.ok) return
  if (resp.status === 451) {
    throw new GeoRestrictedError(exchange, region, resp.status)
  }
  if (
    resp.status === 403 &&
    body !== undefined &&
    bodyIndicatesGeoBlock(body)
  ) {
    throw new GeoRestrictedError(exchange, region, resp.status)
  }
  throw new Error(`${exchange} REST error: ${resp.status}`)
}
