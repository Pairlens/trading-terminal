// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { BlocksIcon, Button } from '@pairlens/ui'

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
    <BlocksIcon size={56} />
    <BlocksIcon size={56} style={{ color: 'var(--primary)' }} />
    <BlocksIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InNav = () => (
  <div style={wrap}>
    <Button variant="ghost" size="icon" aria-label="Plugins">
      <BlocksIcon size={22} />
    </Button>
    <Button variant="outline">
      <BlocksIcon size={18} />
      Plugin store
    </Button>
    <Button variant="secondary">
      <BlocksIcon size={18} />
      Workspaces
    </Button>
  </div>
)
