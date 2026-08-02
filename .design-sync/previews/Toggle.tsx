// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Toggle } from '@pairlens/ui'

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: 16,
}

export const Indicators = () => (
  <div style={row}>
    <Toggle defaultPressed>EMA</Toggle>
    <Toggle>RSI</Toggle>
    <Toggle defaultPressed>Volume</Toggle>
    <Toggle>MACD</Toggle>
  </div>
)

export const OutlineVariant = () => (
  <div style={row}>
    <Toggle variant="outline" defaultPressed>
      Grid
    </Toggle>
    <Toggle variant="outline">Log scale</Toggle>
    <Toggle variant="outline" defaultPressed>
      Crosshair
    </Toggle>
  </div>
)

export const Sizes = () => (
  <div style={row}>
    <Toggle size="sm" defaultPressed>
      1H
    </Toggle>
    <Toggle size="default" defaultPressed>
      Depth
    </Toggle>
    <Toggle size="lg" defaultPressed>
      Auto-scale
    </Toggle>
  </div>
)

export const States = () => (
  <div style={row}>
    <Toggle defaultPressed>Pressed</Toggle>
    <Toggle>Unpressed</Toggle>
    <Toggle disabled>Disabled</Toggle>
    <Toggle disabled defaultPressed>
      Locked on
    </Toggle>
  </div>
)
