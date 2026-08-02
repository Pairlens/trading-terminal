// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type Market = 'okx' | 'binance' | 'bybit' | 'alpaca'
export type AssetClass = 'crypto' | 'stocks'
export type TradingMode = 'paper' | 'live'
export type Regime = 'trend' | 'chop'
export type SignalDecision = 'pending' | 'approved' | 'blocked' | 'watch'

export type Timeframe =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '1d'
  | '3d'
  | '1w'
  | '1M'

export interface Candle {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SignalPayload {
  strategy: 'breakout' | 'ema_pullback' | 'mean_reversion'
  direction: 'long' | 'short'
  confidence: number
  regime: Regime
  // Breakout fields (0 when strategy !== 'breakout')
  hh?: number
  ll?: number
  volConfirmed?: boolean
  // EMA Pullback fields (0 when strategy !== 'ema_pullback')
  fastEma?: number
  slowEma?: number
  emaGap?: number
  // Mean Reversion fields (0 when strategy !== 'mean_reversion')
  ema?: number
  atr?: number
  upperBand?: number
  lowerBand?: number
}
