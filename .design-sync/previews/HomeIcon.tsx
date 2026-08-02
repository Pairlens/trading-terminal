// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { HomeIcon, Button } from '@pairlens/ui'

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
    <HomeIcon size={56} />
    <HomeIcon size={56} style={{ color: 'var(--primary)' }} />
    <HomeIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InNav = () => (
  <div style={wrap}>
    <Button variant="ghost" size="icon" aria-label="Dashboard">
      <HomeIcon size={22} />
    </Button>
    <Button variant="secondary">
      <HomeIcon size={18} />
      Dashboard
    </Button>
    <Button variant="ghost" style={{ color: 'var(--muted-foreground)' }}>
      <HomeIcon size={18} />
      Terminal home
    </Button>
  </div>
)
