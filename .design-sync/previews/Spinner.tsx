// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Spinner, Button } from '@pairlens/ui'

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 16,
}

export const RoutingOrder = () => (
  <div style={row}>
    <Spinner />
    <span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
      Routing order to Binance…
    </span>
  </div>
)

export const Sizes = () => (
  <div style={{ ...row, gap: 20 }}>
    <Spinner className="size-3" />
    <Spinner className="size-4" />
    <Spinner className="size-6" />
    <Spinner className="size-8" style={{ color: 'var(--primary)' }} />
  </div>
)

export const InButton = () => (
  <div style={row}>
    <Button disabled>
      <Spinner />
      Placing order…
    </Button>
    <Button variant="outline" disabled>
      <Spinner />
      Connecting to OKX
    </Button>
  </div>
)
