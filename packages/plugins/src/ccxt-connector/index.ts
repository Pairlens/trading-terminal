// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

// CCXT-backed connector factory (PoC). This module will export
// createCcxtConnectorPlugin; for now it carries the browser boot probe that
// proves a deep-imported ccxt pro exchange class loads through Vite.
import binance from 'ccxt/js/src/pro/binance.js'

export function probeCcxt(): { id: string; watchOHLCV: boolean } {
  const ex = new binance()
  return { id: ex.id, watchOHLCV: Boolean(ex.has['watchOHLCV']) }
}
