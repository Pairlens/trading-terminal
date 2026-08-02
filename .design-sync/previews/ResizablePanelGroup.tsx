// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  Badge,
} from '@pairlens/ui'

const bids = [
  ['68,829.5', '0.842'],
  ['68,828.0', '1.204'],
  ['68,826.5', '0.531'],
  ['68,825.0', '2.118'],
]
const asks = [
  ['68,831.0', '0.612'],
  ['68,832.5', '1.905'],
  ['68,834.0', '0.744'],
  ['68,835.5', '1.330'],
]

const Book = () => (
  <div
    style={{ padding: 12, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
  >
    <div style={{ fontWeight: 600, marginBottom: 8 }}>Order book</div>
    {asks
      .slice()
      .reverse()
      .map(([p, s]) => (
        <div
          key={p}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: 'var(--destructive)',
            padding: '2px 0',
          }}
        >
          <span>{p}</span>
          <span style={{ color: 'var(--muted-foreground)' }}>{s}</span>
        </div>
      ))}
    <div
      style={{
        textAlign: 'center',
        fontWeight: 600,
        padding: '4px 0',
        color: 'var(--chart-2)',
      }}
    >
      68,830.50
    </div>
    {bids.map(([p, s]) => (
      <div
        key={p}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--chart-2)',
          padding: '2px 0',
        }}
      >
        <span>{p}</span>
        <span style={{ color: 'var(--muted-foreground)' }}>{s}</span>
      </div>
    ))}
  </div>
)

const Chart = ({ title }: { title: string }) => (
  <div style={{ padding: 12, height: '100%' }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
      <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
        +2.4%
      </Badge>
    </div>
    <svg
      width="100%"
      height="180"
      viewBox="0 0 400 180"
      preserveAspectRatio="none"
    >
      <polyline
        points="0,150 40,140 80,148 120,110 160,120 200,90 240,100 280,60 320,74 360,40 400,52"
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth={2}
      />
    </svg>
  </div>
)

export const ChartAndBook = () => (
  <div style={{ padding: 16 }}>
    <div
      style={{
        width: 560,
        height: 260,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={65}>
          <Chart title="BTC / USDT" />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={35}>
          <Book />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  </div>
)

export const ThreePane = () => (
  <div style={{ padding: 16 }}>
    <div
      style={{
        width: 620,
        height: 260,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={22}>
          <div style={{ padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Watchlist</div>
            {['BTC / USDT', 'ETH / USDT', 'SOL / USDT', 'XRP / USDT'].map(
              (p) => (
                <div key={p} style={{ padding: '4px 0' }}>
                  {p}
                </div>
              ),
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>
          <Chart title="BTC / USDT" />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={28}>
          <Book />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  </div>
)
