// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@pairlens/ui'

const wrap: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: 16,
}

export const BuySell = () => (
  <div style={wrap}>
    <ButtonGroup>
      <Button variant="default">Buy</Button>
      <Button variant="outline">Sell</Button>
    </ButtonGroup>
  </div>
)

export const TimeframeSegment = () => (
  <div style={wrap}>
    <ButtonGroup>
      <Button variant="outline">1H</Button>
      <Button variant="outline">4H</Button>
      <Button variant="secondary">1D</Button>
      <Button variant="outline">1W</Button>
    </ButtonGroup>
  </div>
)

export const SizeWithLabel = () => (
  <div style={wrap}>
    <ButtonGroup>
      <ButtonGroupText>Size</ButtonGroupText>
      <Button variant="outline">0.25</Button>
      <Button variant="outline">0.5</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Max</Button>
    </ButtonGroup>
  </div>
)

export const Vertical = () => (
  <div style={wrap}>
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Market</Button>
      <Button variant="outline">Limit</Button>
      <Button variant="outline">Stop</Button>
    </ButtonGroup>
  </div>
)
