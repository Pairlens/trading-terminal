// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type BinanceUrls = {
  restBase: string
  wsStream: string
}

/**
 * Resolve Binance API URLs by country code.
 * US users get binance.us; everyone else gets binance.com.
 *
 * WS endpoints intentionally use the DEFAULT port (443), not Binance's
 * alternate `:9443`. Binance serves the identical combined-stream endpoint on
 * both ports, but `:9443` is a non-standard port that corporate firewalls,
 * ISPs, VPNs, and proxies frequently block outbound — which made the socket
 * handshake hang and left Binance (alone among the connectors, all of which use
 * 443) reconnect-looping with no data on those networks. 443 is firewall-safe.
 */
export function resolveBinanceUrls(country: string): BinanceUrls {
  const code = country.toUpperCase()

  if (code === 'US') {
    return {
      restBase: 'https://api.binance.us',
      wsStream: 'wss://stream.binance.us',
    }
  }

  return {
    restBase: 'https://api.binance.com',
    wsStream: 'wss://stream.binance.com',
  }
}

/**
 * Resolve Binance paper-trading (testnet) URLs.
 * Binance testnet uses testnet.binance.vision for both REST and WS,
 * regardless of country.
 */
export function resolveBinancePaperUrls(): BinanceUrls {
  return {
    restBase: 'https://testnet.binance.vision',
    wsStream: 'wss://testnet.binance.vision',
  }
}

/**
 * Resolve Binance URLs with paper-trading awareness.
 * Paper mode always uses testnet.binance.vision; live mode uses
 * the country-resolved production endpoints.
 */
export function resolveBinanceTradingUrls(
  country: string,
  paper: boolean,
): BinanceUrls {
  if (paper) return resolveBinancePaperUrls()
  return resolveBinanceUrls(country)
}
