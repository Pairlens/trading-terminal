// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Tabs, TabsList, TabsTrigger, TabsContent, Badge } from '@pairlens/ui'

const bids = [
  ['68,830.5', '1.245', 'var(--chart-2)'],
  ['68,829.0', '0.480', 'var(--chart-2)'],
  ['68,827.5', '2.113', 'var(--chart-2)'],
]
const asks = [
  ['68,832.0', '0.902', 'var(--destructive)'],
  ['68,833.5', '1.560', 'var(--destructive)'],
  ['68,835.0', '0.334', 'var(--destructive)'],
]

export const MarketPanel = () => (
  <div style={{ padding: 16 }}>
    <Tabs defaultValue="orderbook" style={{ width: 340 }}>
      <TabsList>
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="orderbook">Order book</TabsTrigger>
        <TabsTrigger value="trades">Trades</TabsTrigger>
      </TabsList>
      <TabsContent value="chart">
        <div
          style={{
            padding: 12,
            color: 'var(--muted-foreground)',
            fontSize: 13,
          }}
        >
          BTC / USDT · 4h — last close $68,830.50
        </div>
      </TabsContent>
      <TabsContent value="orderbook">
        <div style={{ padding: '8px 4px', fontVariantNumeric: 'tabular-nums' }}>
          {asks.map(([px, sz, c]) => (
            <div
              key={px}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '2px 8px',
              }}
            >
              <span style={{ color: c }}>{px}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>{sz}</span>
            </div>
          ))}
          <div
            style={{
              padding: '4px 8px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--foreground)',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            68,831.2 · spread 0.02%
          </div>
          {bids.map(([px, sz, c]) => (
            <div
              key={px}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '2px 8px',
              }}
            >
              <span style={{ color: c }}>{px}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>{sz}</span>
            </div>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="trades">
        <div
          style={{
            padding: 12,
            color: 'var(--muted-foreground)',
            fontSize: 13,
          }}
        >
          Last 50 prints streaming from OKX
        </div>
      </TabsContent>
    </Tabs>
  </div>
)

export const LineVariant = () => (
  <div style={{ padding: 16 }}>
    <Tabs defaultValue="positions" style={{ width: 340 }}>
      <TabsList variant="line">
        <TabsTrigger value="positions">Positions</TabsTrigger>
        <TabsTrigger value="orders">Open orders</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="positions">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 4px',
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 500 }}>SOL / USDT</span>
          <Badge variant="secondary">Long 12.4</Badge>
          <span style={{ color: 'var(--chart-2)' }}>+$184.20</span>
        </div>
      </TabsContent>
      <TabsContent value="orders">
        <div
          style={{
            padding: 10,
            color: 'var(--muted-foreground)',
            fontSize: 13,
          }}
        >
          1 limit buy · ETH/USDT @ 3,480.00
        </div>
      </TabsContent>
      <TabsContent value="history">
        <div
          style={{
            padding: 10,
            color: 'var(--muted-foreground)',
            fontSize: 13,
          }}
        >
          32 fills in the last 24h
        </div>
      </TabsContent>
    </Tabs>
  </div>
)
