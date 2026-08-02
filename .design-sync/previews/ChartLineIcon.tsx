// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ChartLineIcon } from '@pairlens/ui'

export const Large = () => (
  <div style={{ padding: 24, color: 'var(--chart-2)' }}>
    <ChartLineIcon size={72} />
  </div>
)

export const Sizes = () => (
  <div
    style={{
      padding: 24,
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      color: 'var(--foreground)',
    }}
  >
    <ChartLineIcon size={32} />
    <ChartLineIcon size={48} />
    <div style={{ color: 'var(--chart-2)' }}>
      <ChartLineIcon size={64} />
    </div>
    <div style={{ color: 'var(--primary)' }}>
      <ChartLineIcon size={64} />
    </div>
  </div>
)

export const InLabel = () => (
  <div
    style={{
      padding: 24,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 18,
      fontWeight: 600,
    }}
  >
    <div style={{ color: 'var(--chart-2)' }}>
      <ChartLineIcon size={40} />
    </div>
    <span>Live signals</span>
  </div>
)
