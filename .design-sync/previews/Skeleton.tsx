// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Skeleton } from '@pairlens/ui'

export const PositionCardLoading = () => (
  <div
    style={{
      padding: 16,
      maxWidth: 360,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      margin: 16,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Skeleton style={{ height: 40, width: 40, borderRadius: 9999 }} />
      <div style={{ flex: 1, display: 'grid', gap: 8 }}>
        <Skeleton style={{ height: 14, width: '55%' }} />
        <Skeleton style={{ height: 12, width: '35%' }} />
      </div>
    </div>
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <Skeleton style={{ height: 12, width: '100%' }} />
      <Skeleton style={{ height: 12, width: '80%' }} />
      <Skeleton style={{ height: 12, width: '90%' }} />
    </div>
  </div>
)

export const WatchlistLoading = () => (
  <div style={{ padding: 16, maxWidth: 360, display: 'grid', gap: 14 }}>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skeleton style={{ height: 32, width: 32, borderRadius: 9999 }} />
        <div style={{ flex: 1, display: 'grid', gap: 6 }}>
          <Skeleton style={{ height: 12, width: '40%' }} />
          <Skeleton style={{ height: 10, width: '25%' }} />
        </div>
        <Skeleton style={{ height: 12, width: 56 }} />
      </div>
    ))}
  </div>
)

export const ChartLoading = () => (
  <div style={{ padding: 16, maxWidth: 420 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <Skeleton style={{ height: 16, width: 120 }} />
      <Skeleton style={{ height: 16, width: 64 }} />
    </div>
    <Skeleton style={{ height: 180, width: '100%', marginTop: 12 }} />
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <Skeleton style={{ height: 24, width: 48 }} />
      <Skeleton style={{ height: 24, width: 48 }} />
      <Skeleton style={{ height: 24, width: 48 }} />
    </div>
  </div>
)
