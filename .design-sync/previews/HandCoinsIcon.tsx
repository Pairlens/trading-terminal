// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { HandCoinsIcon, Button } from '@pairlens/ui'

const wrap: React.CSSProperties = {
  padding: 16,
  display: 'flex',
  gap: 20,
  alignItems: 'center',
  flexWrap: 'wrap',
  color: 'var(--foreground)',
}

export const Large = () => (
  <div style={wrap}>
    <HandCoinsIcon size={56} />
    <HandCoinsIcon size={56} style={{ color: 'var(--chart-2)' }} />
    <HandCoinsIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InAction = () => (
  <div style={wrap}>
    <Button variant="default">
      <HandCoinsIcon size={18} />
      Buy BTC
    </Button>
    <Button variant="outline">
      <HandCoinsIcon size={18} />
      Deposit USDT
    </Button>
    <Button variant="ghost" size="icon" aria-label="Portfolio">
      <HandCoinsIcon size={22} />
    </Button>
  </div>
)
