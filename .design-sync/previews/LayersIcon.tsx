// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { LayersIcon, Button } from '@pairlens/ui'

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
    <LayersIcon size={56} />
    <LayersIcon size={56} style={{ color: 'var(--primary)' }} />
    <LayersIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InNav = () => (
  <div style={wrap}>
    <Button variant="ghost" size="icon" aria-label="Order book depth">
      <LayersIcon size={22} />
    </Button>
    <Button variant="outline">
      <LayersIcon size={18} />
      Order book
    </Button>
    <Button variant="secondary">
      <LayersIcon size={18} />
      Chart overlays
    </Button>
  </div>
)
