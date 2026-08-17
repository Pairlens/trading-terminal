// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type {
  MarketAdapter,
  MarketAdapterInfo,
  MarketAdapterCapability,
  AssetClass,
  CredentialField,
} from './adapter'
export type {
  Candle,
  CandleUpdate,
  CandleCallback,
  TickerSnapshot,
  TickerUpdate,
  TickerCallback,
  OrderbookLevel,
  OrderbookUpdate,
  OrderbookCallback,
  OrderParams,
  OrderResult,
  OrderSide,
  OrderType,
  Instrument,
  InstrumentFilter,
  NormalizedOrderUpdate,
  NormalizedBalance,
} from './types'
export { CandleBuffer } from './candle-buffer'
export { aggregateCandles } from './candle-aggregator'
export {
  StreamThrottle,
  type ThrottleMode,
  type ThrottleStream,
} from './throttle'
export { hmacSign, hmacSignHex } from './hmac-signer'
export {
  connectWs,
  type WsConnection,
  type WsAdapterEvents,
} from './ws-adapter'
export {
  isMsTimestamp,
  validateCandle,
  validateTicker,
  validateOrderbookSide,
  type ValidationResult,
} from './validation'
export { crc32 } from './checksum'
export { StalenessTracker } from './staleness'
export {
  WakeMonitor,
  wakeMonitor,
  type WakeEvent,
  type WakeListener,
  type WakeReason,
  type WakeSource,
} from './wake-monitor'
export { latencyMonitor, type VenueLatency } from './latency'
export {
  GeoRestrictedError,
  isGeoRestrictedError,
  assertResponseOk,
  ProviderThrottledError,
  isProviderThrottledError,
  providerThrottleFromResponse,
  parseRetryAfterMs,
} from './errors'
export {
  noteProviderThrottled,
  providerThrottledUntil,
  isProviderThrottled,
  assertNotThrottled,
} from './provider-throttle'
