// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  Button,
} from '@pairlens/ui'

export const NoOpenPositions = () => (
  <div style={{ padding: 16, maxWidth: 420 }}>
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <span style={{ fontSize: 18 }}>◎</span>
        </EmptyMedia>
        <EmptyTitle>No open positions</EmptyTitle>
        <EmptyDescription>
          Your portfolio is flat. Place a spot order or arm a strategy to start
          trading on connected venues.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">New order</Button>
      </EmptyContent>
    </Empty>
  </div>
)

export const NoSignalsYet = () => (
  <div style={{ padding: 16, maxWidth: 420 }}>
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <span style={{ fontSize: 18 }}>↗</span>
        </EmptyMedia>
        <EmptyTitle>Waiting for signals</EmptyTitle>
        <EmptyDescription>
          No breakout or pullback signals on BTC/USDT 4h yet. The strategy
          engine computes on each candle close.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline">
          Change timeframe
        </Button>
      </EmptyContent>
    </Empty>
  </div>
)

export const NoVenuesConnected = () => (
  <div style={{ padding: 16, maxWidth: 420 }}>
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <span style={{ fontSize: 18 }}>⚡</span>
        </EmptyMedia>
        <EmptyTitle>No venues connected</EmptyTitle>
        <EmptyDescription>
          Add an exchange connector to stream live market data. API keys are
          stored locally in your OS keychain.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">Connect exchange</Button>
      </EmptyContent>
    </Empty>
  </div>
)
