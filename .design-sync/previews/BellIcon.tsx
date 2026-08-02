// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { BellIcon, Button, Badge } from '@pairlens/ui'

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
    <BellIcon size={56} />
    <BellIcon size={56} style={{ color: 'var(--primary)' }} />
    <BellIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InNav = () => (
  <div style={wrap}>
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alerts"
      style={{ position: 'relative' }}
    >
      <BellIcon size={22} />
    </Button>
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <Button variant="outline" size="icon" aria-label="Alerts">
        <BellIcon size={22} />
      </Button>
      <Badge
        variant="destructive"
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          padding: '0 6px',
          fontSize: 10,
        }}
      >
        3
      </Badge>
    </div>
    <Button variant="secondary">
      <BellIcon size={18} />
      Price alerts
    </Button>
  </div>
)
