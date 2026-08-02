// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { WaypointsIcon, Button } from '@pairlens/ui'

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
    <WaypointsIcon size={56} />
    <WaypointsIcon size={56} style={{ color: 'var(--primary)' }} />
    <WaypointsIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InNav = () => (
  <div style={wrap}>
    <Button variant="ghost" size="icon" aria-label="Routing">
      <WaypointsIcon size={22} />
    </Button>
    <Button variant="outline">
      <WaypointsIcon size={18} />
      Smart routing
    </Button>
    <Button variant="secondary">
      <WaypointsIcon size={18} />
      Venues
    </Button>
  </div>
)
