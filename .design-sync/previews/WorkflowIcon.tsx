// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { WorkflowIcon, Button } from '@pairlens/ui'

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
    <WorkflowIcon size={56} />
    <WorkflowIcon size={56} style={{ color: 'var(--primary)' }} />
    <WorkflowIcon size={56} style={{ color: 'var(--muted-foreground)' }} />
  </div>
)

export const InNav = () => (
  <div style={wrap}>
    <Button variant="ghost" size="icon" aria-label="Automations">
      <WorkflowIcon size={22} />
    </Button>
    <Button variant="default">
      <WorkflowIcon size={18} />
      New workflow
    </Button>
    <Button variant="secondary">
      <WorkflowIcon size={18} />
      Automations
    </Button>
  </div>
)
