// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Separator } from '@pairlens/ui'

export const Horizontal = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <div style={{ fontSize: 14, fontWeight: 600 }}>Portfolio value</div>
    <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
      Across 6 connected venues
    </div>
    <Separator style={{ margin: '12px 0' }} />
    <div style={{ fontSize: 28, fontWeight: 600 }}>$128,406.22</div>
  </div>
)

export const VerticalStats = () => (
  <div style={{ padding: 16 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 40,
        gap: 16,
        fontSize: 14,
      }}
    >
      <div>
        <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
          Last
        </div>
        <div style={{ fontWeight: 600 }}>$68,830.50</div>
      </div>
      <Separator orientation="vertical" />
      <div>
        <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
          24h
        </div>
        <div style={{ fontWeight: 600, color: 'var(--chart-2)' }}>+2.41%</div>
      </div>
      <Separator orientation="vertical" />
      <div>
        <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
          24h Vol
        </div>
        <div style={{ fontWeight: 600 }}>$1.2B</div>
      </div>
    </div>
  </div>
)

export const InlineList = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    {['BTC / USDT', 'ETH / USDT', 'SOL / USDT'].map((pair, i, arr) => (
      <div key={pair}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            padding: '8px 0',
          }}
        >
          <span>{pair}</span>
          <span style={{ color: 'var(--muted-foreground)' }}>OKX</span>
        </div>
        {i < arr.length - 1 && <Separator />}
      </div>
    ))}
  </div>
)
