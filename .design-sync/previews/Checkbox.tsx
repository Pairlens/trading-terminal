// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Checkbox, Label } from '@pairlens/ui'

export const States = () => (
  <div style={{ padding: 16, display: 'grid', gap: 14 }}>
    <Label htmlFor="c1" style={{ gap: 8 }}>
      <Checkbox id="c1" defaultChecked />
      Reduce-only order
    </Label>
    <Label htmlFor="c2" style={{ gap: 8 }}>
      <Checkbox id="c2" />
      Post-only (maker)
    </Label>
    <Label htmlFor="c3" style={{ gap: 8 }}>
      <Checkbox id="c3" defaultChecked disabled />
      Enforce risk guardrails
    </Label>
  </div>
)

export const VenueList = () => (
  <div style={{ padding: 16, display: 'grid', gap: 12 }}>
    <span style={{ fontSize: 13, fontWeight: 600 }}>Route across venues</span>
    <Label htmlFor="v-okx" style={{ gap: 8 }}>
      <Checkbox id="v-okx" defaultChecked />
      OKX
    </Label>
    <Label htmlFor="v-binance" style={{ gap: 8 }}>
      <Checkbox id="v-binance" defaultChecked />
      Binance
    </Label>
    <Label htmlFor="v-coinbase" style={{ gap: 8 }}>
      <Checkbox id="v-coinbase" />
      Coinbase
    </Label>
  </div>
)

export const Invalid = () => (
  <div style={{ padding: 16 }}>
    <Label htmlFor="terms" style={{ gap: 8 }}>
      <Checkbox id="terms" aria-invalid />I accept the live-trading risk
      disclosure
    </Label>
  </div>
)
