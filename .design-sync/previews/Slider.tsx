// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Slider, Label } from '@pairlens/ui'

export const PositionSize = () => (
  <div style={{ padding: 16, width: 320, display: 'grid', gap: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Label>Position size</Label>
      <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        45% · 0.31 BTC
      </span>
    </div>
    <Slider defaultValue={[45]} max={100} step={1} />
  </div>
)

export const Leverage = () => (
  <div style={{ padding: 16, width: 320, display: 'grid', gap: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Label>Take-profit ladder</Label>
      <span style={{ fontSize: 13, color: 'var(--chart-2)' }}>
        +2.5% → +8.0%
      </span>
    </div>
    <Slider defaultValue={[25, 80]} max={100} step={1} />
  </div>
)

export const Disabled = () => (
  <div style={{ padding: 16, width: 320, display: 'grid', gap: 8 }}>
    <Label>Slippage tolerance (locked)</Label>
    <Slider defaultValue={[50]} max={100} disabled />
  </div>
)
