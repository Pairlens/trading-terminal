// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Label, Input, Checkbox } from '@pairlens/ui'

export const WithInput = () => (
  <div style={{ padding: 16, maxWidth: 320, display: 'grid', gap: 6 }}>
    <Label htmlFor="stop-price">Stop-loss price</Label>
    <Input id="stop-price" inputMode="decimal" defaultValue="3,410.00" />
  </div>
)

export const WithCheckbox = () => (
  <div style={{ padding: 16 }}>
    <Label htmlFor="reduce-only" style={{ gap: 8 }}>
      <Checkbox id="reduce-only" defaultChecked />
      Reduce-only order
    </Label>
  </div>
)

export const Disabled = () => (
  <div style={{ padding: 16 }} className="group" data-disabled="true">
    <Label htmlFor="margin">Cross-margin mode</Label>
    <Input
      id="margin"
      disabled
      defaultValue="Not available on spot"
      style={{ marginTop: 6 }}
    />
  </div>
)
