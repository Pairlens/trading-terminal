// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which stored credential signs for a venue.
 *
 * Until perpetual futures arrived this was the identity function: a credential
 * carried `market: 'binance'` and the Binance venue was the only thing it
 * could reach. Binance Futures and KuCoin Futures broke that. They are
 * separate venues with separate connectors and separate market ids, but they
 * authenticate with the SAME exchange key as their spot sibling, declared on
 * the futures manifest as `metadata.credentialAlias`. One entry in Accounts,
 * two venues.
 *
 * Every surface that asks "does the user have an account here" therefore has
 * to resolve the alias first. Asking with the raw market id returns nothing
 * for `binance-futures` no matter how many Binance keys are stored, and the
 * ticket blurs itself behind a connect gate for an account that is already
 * connected. That is the bug this module exists to prevent, in one place
 * rather than at the seven call sites that ask the question.
 *
 * The map is a module-level cache rather than a hook because the callers are
 * list rows and deep inside a ticket, and every one of them already
 * re-renders when the venue table changes. `market-data-provider` fills it
 * from the active manifests on the same pass that rebuilds that table, so a
 * lookup is always at least as fresh as the venue list beside it.
 *
 * That pass runs in an effect, and the callers are its own descendants — their
 * first render lands BEFORE it. So the provider also registers a source here,
 * and the first read that arrives with the map still empty populates it
 * synchronously off that source. One scan per session, not per miss: a miss is
 * the ordinary answer for every venue that owns its own key.
 */
import type { PluginInstance } from '@pairlens/plugin-system/types'
import { venueBalanceCredentialKey } from '@/stores/balances-store'

/** venue marketId → the credential market that provisions it. */
const aliases = new Map<string, string>()
let populated = false
let source: (() => Array<[string, string]>) | null = null

/** Replace the alias map. Called once per venue-table rebuild. */
export function setCredentialAliases(entries: Array<[string, string]>): void {
  aliases.clear()
  for (const [venue, credentialMarket] of entries) {
    aliases.set(venue, credentialMarket)
  }
  populated = true
}

/**
 * Where to read aliases from before the first `setCredentialAliases`.
 *
 * Registered by the provider that owns the plugin manager; the module cannot
 * reach one on its own, and a wrong answer on the first render is a connect
 * gate over an account the user already connected.
 */
export function setCredentialAliasSource(
  read: () => Array<[string, string]>,
): void {
  source = read
}

/** The (venue, credential market) pairs a set of connector manifests declare. */
export function credentialAliasEntries(
  plugins: Array<PluginInstance>,
): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const plugin of plugins) {
    const alias = plugin.manifest.metadata?.['credentialAlias']
    if (typeof alias !== 'string' || alias.length === 0) continue
    const marketId = plugin.manifest.capabilities.find(
      (c) =>
        (c.id === 'market-data:candles' || c.id === 'market-data:discovery') &&
        !c.markets.includes('*'),
    )?.markets[0]
    if (marketId) entries.push([marketId, alias])
  }
  return entries
}

function ensurePopulated(): void {
  if (populated || !source) return
  setCredentialAliases(source())
}

/** The credential `market` value that signs for this venue. */
export function credentialMarketFor(market: string): string {
  ensurePopulated()
  return aliases.get(market) ?? market
}

/** True when this venue borrows another venue's credential. */
export function isAliasedVenue(market: string): boolean {
  ensurePopulated()
  return aliases.has(market)
}

/** This venue's credentials, alias resolved. */
export function credentialsForMarket<T extends { market: string }>(
  credentials: Array<T>,
  market: string,
): Array<T> {
  const target = credentialMarketFor(market)
  return credentials.filter((c) => c.market === target)
}

/**
 * Whether ANY stored credential signs for this venue.
 *
 * The question four surfaces actually ask (the venue chip's `read-only` tag,
 * the watchlist sub-line, the venue picker, the connect gate). They asked it
 * by building the filtered array and reading `.length`, which allocates a
 * list per render to answer a boolean.
 */
export function hasCredentialForMarket<T extends { market: string }>(
  credentials: Array<T>,
  market: string,
): boolean {
  const target = credentialMarketFor(market)
  return credentials.some((c) => c.market === target)
}

/**
 * Where this account's balances for this venue are recorded.
 *
 * An aliased venue gets its own namespace: a futures margin balance and a spot
 * balance are two different numbers under one credential id, and the bare id
 * would have let whichever arrived last stand for both.
 */
export function balanceScopeFor(credentialId: string, market: string): string {
  return isAliasedVenue(market)
    ? venueBalanceCredentialKey(credentialId, market)
    : credentialId
}
