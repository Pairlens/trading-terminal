// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit Global's regional hosts.
 *
 * Upbit Global runs three separate exchanges, not three mirrors: Singapore
 * (`sg-api`, the default), Indonesia (`id-api`) and Thailand (`th-api`), each
 * with its own market list and its own fiat quote. ccxt ships the KOREAN host
 * (`api.upbit.com`) as its `hostname` default, which is a fourth, different
 * exchange again — KRW pairs a Pairlens user has never seen. So the host is
 * always set explicitly.
 *
 * One field covers both transports: ccxt templates `{hostname}` into
 * `urls.api.public`, `urls.api.private` (`upbit.js:100-103`) AND into the Pro
 * class's `urls.api.ws` (`pro/upbit.js:31`), and both are imploded per request,
 * so `exchange.hostname = …` moves REST and the socket together.
 *
 * No dev proxy is needed. The native routes through `/__upbit*` in browser dev,
 * but every regional host answers with `Access-Control-Allow-Origin: *`
 * (measured 2026-08), so the direct origin works in the browser, the Tauri
 * webview and bun alike.
 *
 * ## The quote-currency list the native carries
 *
 * `resolveUpbitQuoteCurrencies` exists in the native connector because its
 * bulk-ticker call is `/v1/ticker/all?quoteCurrencies=…` and a region rejects
 * the WHOLE request when the list names a quote it does not trade — SGD on
 * `id-api`, KRW anywhere but Korea. ccxt asks a different question:
 * `fetchTickers` chunks `this.ids` (the region's own `market/all` response)
 * into `/v1/ticker?markets=…` queries, so the set of quotes is whatever the
 * host actually lists and cannot disagree with itself. The list is kept here
 * anyway — as the documented region contract, and because the trading phase's
 * balance/deposit surfaces still reason in quotes.
 */

const ID_COUNTRIES = new Set(['ID'])
const TH_COUNTRIES = new Set(['TH'])

/** REST + WS host for a country. Singapore is the default. */
export function resolveUpbitHost(country: string): string {
  const code = country.toUpperCase()
  if (ID_COUNTRIES.has(code)) return 'id-api.upbit.com'
  if (TH_COUNTRIES.has(code)) return 'th-api.upbit.com'
  return 'sg-api.upbit.com'
}

/** Quote currencies a region trades, most significant first. */
export function resolveUpbitQuoteCurrencies(country: string): Array<string> {
  const code = country.toUpperCase()
  if (ID_COUNTRIES.has(code)) return ['IDR', 'BTC', 'USDT']
  if (TH_COUNTRIES.has(code)) return ['THB', 'BTC', 'USDT']
  return ['SGD', 'BTC', 'USDT']
}
