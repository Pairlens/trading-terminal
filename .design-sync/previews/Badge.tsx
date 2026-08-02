// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Badge } from '@pairlens/ui'

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: 16,
}

export const Variants = () => (
  <div style={row}>
    <Badge variant="default">LIVE</Badge>
    <Badge variant="secondary">Paper</Badge>
    <Badge variant="destructive">BLOCK</Badge>
    <Badge variant="outline">OKX</Badge>
    <Badge variant="ghost">Watchlist</Badge>
    <Badge variant="link">View trade</Badge>
  </div>
)

export const SignalStatus = () => (
  <div style={row}>
    <Badge variant="default">APPROVE</Badge>
    <Badge variant="destructive">BLOCK</Badge>
    <Badge variant="secondary">WATCH</Badge>
    <Badge
      variant="outline"
      style={{ color: 'var(--chart-2)', borderColor: 'var(--chart-2)' }}
    >
      Long
    </Badge>
    <Badge
      variant="outline"
      style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)' }}
    >
      Short
    </Badge>
  </div>
)

export const PriceDeltas = () => (
  <div style={row}>
    <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
      +12.4%
    </Badge>
    <Badge variant="secondary" style={{ color: 'var(--destructive)' }}>
      -3.7%
    </Badge>
    <Badge variant="secondary">BTC/USDT</Badge>
    <Badge variant="outline">4h</Badge>
    <Badge variant="default">Filled</Badge>
  </div>
)
