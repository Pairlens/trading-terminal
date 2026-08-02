// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Button } from '@pairlens/ui'

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: 16,
}

export const Variants = () => (
  <div style={row}>
    <Button variant="default">Buy BTC</Button>
    <Button variant="secondary">Preview order</Button>
    <Button variant="outline">Cancel</Button>
    <Button variant="ghost">Details</Button>
    <Button variant="destructive">Close position</Button>
    <Button variant="link">View on explorer</Button>
  </div>
)

export const Sizes = () => (
  <div style={row}>
    <Button size="xs">xs</Button>
    <Button size="sm">sm</Button>
    <Button size="default">default</Button>
    <Button size="lg">lg</Button>
  </div>
)

export const States = () => (
  <div style={row}>
    <Button>Enabled</Button>
    <Button disabled>Disabled</Button>
    <Button variant="outline" disabled>
      Disabled outline
    </Button>
  </div>
)
