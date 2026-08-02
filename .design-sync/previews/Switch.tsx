// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Switch, Label } from '@pairlens/ui'

export const States = () => (
  <div style={{ padding: 16, display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Switch id="s-on" defaultChecked />
      <Label htmlFor="s-on">Live trading enabled</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Switch id="s-off" />
      <Label htmlFor="s-off">Paper trading only</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Switch id="s-dis" defaultChecked disabled />
      <Label htmlFor="s-dis">Risk guardrails (locked on)</Label>
    </div>
  </div>
)

export const Sizes = () => (
  <div style={{ padding: 16, display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Switch id="sz-def" defaultChecked />
      <Label htmlFor="sz-def">Streaming ticks (default)</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Switch id="sz-sm" size="sm" defaultChecked />
      <Label htmlFor="sz-sm">Compact order-book depth (sm)</Label>
    </div>
  </div>
)

export const CopilotToggle = () => (
  <div
    style={{
      padding: 16,
      maxWidth: 360,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}
  >
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>AI co-pilot</span>
      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
        Analyze each signal as APPROVE / BLOCK / WATCH.
      </span>
    </div>
    <Switch defaultChecked />
  </div>
)
