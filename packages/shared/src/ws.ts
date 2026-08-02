// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle, Market, SignalPayload, Timeframe } from './types'
import type {
  AIMessage,
  RiskState,
  Signal,
  UserConfig,
  WorkspaceLayout,
} from './persistence-types'

export interface WsEnvelope<TType extends string, TPayload> {
  type: TType
  payload: TPayload
}

export type ClientToRtsMessage =
  | WsEnvelope<
      'subscribe',
      { market: Market; pairKey: string; timeframe: Timeframe }
    >
  | WsEnvelope<
      'unsubscribe',
      { market: Market; pairKey: string; timeframe: Timeframe }
    >
  | WsEnvelope<'orderbook.subscribe', { market: Market; pairKey: string }>
  | WsEnvelope<'orderbook.unsubscribe', { market: Market; pairKey: string }>
  | WsEnvelope<'ticker.subscribe', { market: Market; pairKey: string }>
  | WsEnvelope<'ticker.unsubscribe', { market: Market; pairKey: string }>
  | WsEnvelope<'heartbeat', { visiblePairs: Array<string> }>
  | WsEnvelope<'trade.confirm', { orderId: string }>

export type OrderBookLevel = { price: number; size: number }

export type RtsToClientMessage =
  | WsEnvelope<
      'pair.snapshot',
      {
        market: Market
        pairKey: string
        timeframe: Timeframe
        candles: Array<Candle>
      }
    >
  | WsEnvelope<
      'pair.candle',
      { market: Market; pairKey: string; timeframe: Timeframe; candle: Candle }
    >
  | WsEnvelope<
      'signal.ready',
      {
        market: Market
        pairKey: string
        timeframe: Timeframe
        signal: SignalPayload
      }
    >
  | WsEnvelope<
      'orderbook.snapshot',
      {
        market: Market
        pairKey: string
        bids: Array<OrderBookLevel>
        asks: Array<OrderBookLevel>
        ts: number
      }
    >
  | WsEnvelope<
      'ticker.snapshot',
      {
        market: Market
        pairKey: string
        last: number
        ts: number
      }
    >
  | WsEnvelope<
      'trade.status',
      { orderId: string; status: 'accepted' | 'rejected'; reason?: string }
    >
  | WsEnvelope<
      'error',
      {
        code:
          | 'unauthorized'
          | 'invalid_message'
          | 'not_implemented'
          | 'internal_error'
        message: string
      }
    >
  | WsEnvelope<'userConfig.updated', UserConfig>
  | WsEnvelope<'riskState.updated', RiskState>
  | WsEnvelope<'signal.new', Signal>
  | WsEnvelope<'aiMessage.new', AIMessage>
  | WsEnvelope<'workspace.updated', WorkspaceLayout>
  | WsEnvelope<'auth.session', { userId: string; email: string }>
  | WsEnvelope<
      'handshake_ack',
      {
        protocolVersion: number
        symbolTable: {
          markets: Record<string, number>
          timeframes: Record<string, number>
          strategies: Record<string, number>
        }
      }
    >
