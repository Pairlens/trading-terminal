// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Alpaca endpoint resolution.
//
// Alpaca is a US broker with globally reachable APIs — there is no regional
// routing. The only split is paper vs live for the Trading API. Market data
// (REST + WS) lives on a single host shared by both modes; the `iex` feed is
// the one available on free/Basic data plans (SIP requires a paid plan).

export type AlpacaTradingUrls = {
  restBase: string
}

export function resolveAlpacaTradingUrls(paper: boolean): AlpacaTradingUrls {
  return {
    restBase: paper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets',
  }
}

export const ALPACA_DATA_REST = 'https://data.alpaca.markets'
export const ALPACA_DATA_WS = 'wss://stream.data.alpaca.markets/v2/iex'
