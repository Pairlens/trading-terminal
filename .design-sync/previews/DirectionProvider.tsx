// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { DirectionProvider, Input, Label, Button, Badge } from '@pairlens/ui'

// DirectionProvider is a base-ui context provider with no visual output of its
// own. These cells wrap real DS components so the RTL vs LTR layout difference
// is visible: labels, inputs, badges and the button row all mirror.

const OrderForm = () => (
  <div style={{ display: 'grid', gap: 12, maxWidth: 340 }}>
    <div style={{ display: 'grid', gap: 6 }}>
      <Label htmlFor="dp-pair">Trading pair</Label>
      <Input id="dp-pair" defaultValue="BTC/USDT" />
    </div>
    <div style={{ display: 'grid', gap: 6 }}>
      <Label htmlFor="dp-price">Limit price (USDT)</Label>
      <Input id="dp-price" inputMode="decimal" defaultValue="68,240.50" />
    </div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Badge variant="secondary">OKX</Badge>
      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
        Auto-routed venue
      </span>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="outline">Cancel</Button>
      <Button>Place buy order</Button>
    </div>
  </div>
)

export const LeftToRight = () => (
  <div style={{ padding: 16 }}>
    <div
      style={{
        fontSize: 12,
        color: 'var(--muted-foreground)',
        marginBottom: 10,
      }}
    >
      direction="ltr"
    </div>
    <DirectionProvider direction="ltr">
      <OrderForm />
    </DirectionProvider>
  </div>
)

export const RightToLeft = () => (
  <div style={{ padding: 16 }} dir="rtl">
    <div
      style={{
        fontSize: 12,
        color: 'var(--muted-foreground)',
        marginBottom: 10,
      }}
    >
      direction="rtl"
    </div>
    <DirectionProvider direction="rtl">
      <OrderForm />
    </DirectionProvider>
  </div>
)
