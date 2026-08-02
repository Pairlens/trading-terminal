// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Input, Label } from '@pairlens/ui'

export const Default = () => (
  <div style={{ padding: 16, maxWidth: 320, display: 'grid', gap: 6 }}>
    <Label htmlFor="pair">Trading pair</Label>
    <Input id="pair" defaultValue="BTC/USDT" />
  </div>
)

export const Placeholder = () => (
  <div style={{ padding: 16, maxWidth: 320, display: 'grid', gap: 6 }}>
    <Label htmlFor="limit-price">Limit price</Label>
    <Input id="limit-price" type="number" placeholder="68,240.50 USDT" />
  </div>
)

export const Invalid = () => (
  <div style={{ padding: 16, maxWidth: 320, display: 'grid', gap: 6 }}>
    <Label htmlFor="size">Order size</Label>
    <Input id="size" aria-invalid defaultValue="12.5" />
    <span style={{ fontSize: 12, color: 'var(--destructive)' }}>
      Exceeds 5% position guardrail for this account.
    </span>
  </div>
)

export const Disabled = () => (
  <div style={{ padding: 16, maxWidth: 320, display: 'grid', gap: 6 }}>
    <Label htmlFor="venue">Routing venue</Label>
    <Input id="venue" disabled defaultValue="OKX (auto-routed)" />
  </div>
)
