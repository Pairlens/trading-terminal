// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ToggleGroup, ToggleGroupItem } from '@pairlens/ui'

const wrap: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: 16,
}

export const Timeframe = () => (
  <div style={wrap}>
    <ToggleGroup defaultValue={['4h']}>
      <ToggleGroupItem value="1h">1H</ToggleGroupItem>
      <ToggleGroupItem value="4h">4H</ToggleGroupItem>
      <ToggleGroupItem value="1d">1D</ToggleGroupItem>
      <ToggleGroupItem value="1w">1W</ToggleGroupItem>
    </ToggleGroup>
  </div>
)

export const ChartType = () => (
  <div style={wrap}>
    <ToggleGroup variant="outline" defaultValue={['candles']}>
      <ToggleGroupItem value="line">Line</ToggleGroupItem>
      <ToggleGroupItem value="candles">Candles</ToggleGroupItem>
      <ToggleGroupItem value="area">Area</ToggleGroupItem>
    </ToggleGroup>
  </div>
)

export const SpacedOverlays = () => (
  <div style={wrap}>
    <ToggleGroup
      variant="outline"
      spacing={2}
      multiple
      defaultValue={['ema', 'vol']}
    >
      <ToggleGroupItem value="ema">EMA</ToggleGroupItem>
      <ToggleGroupItem value="vwap">VWAP</ToggleGroupItem>
      <ToggleGroupItem value="vol">Volume</ToggleGroupItem>
    </ToggleGroup>
  </div>
)

export const Sizes = () => (
  <div style={{ ...wrap, flexDirection: 'column', alignItems: 'flex-start' }}>
    <ToggleGroup size="sm" defaultValue={['4h']}>
      <ToggleGroupItem value="1h">1H</ToggleGroupItem>
      <ToggleGroupItem value="4h">4H</ToggleGroupItem>
      <ToggleGroupItem value="1d">1D</ToggleGroupItem>
    </ToggleGroup>
    <ToggleGroup size="lg" defaultValue={['1d']}>
      <ToggleGroupItem value="1h">1H</ToggleGroupItem>
      <ToggleGroupItem value="4h">4H</ToggleGroupItem>
      <ToggleGroupItem value="1d">1D</ToggleGroupItem>
    </ToggleGroup>
  </div>
)
