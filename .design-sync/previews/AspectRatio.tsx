// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AspectRatio } from '@pairlens/ui'

const box = {
  position: 'absolute' as const,
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--muted-foreground)',
  fontSize: 13,
}

export const ChartThumbnail = () => (
  <div style={{ padding: 16, width: 360 }}>
    <AspectRatio
      ratio={16 / 9}
      style={{
        width: 328,
        aspectRatio: '16 / 9',
        background: 'var(--muted)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div style={box}>BTC/USDT · 16:9 chart preview</div>
    </AspectRatio>
  </div>
)

export const SquareLogo = () => (
  <div style={{ padding: 16, width: 200 }}>
    <AspectRatio
      ratio={1}
      style={{
        width: 168,
        aspectRatio: '1 / 1',
        background: 'var(--muted)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div style={box}>1:1</div>
    </AspectRatio>
  </div>
)

export const Wide = () => (
  <div style={{ padding: 16, width: 420 }}>
    <AspectRatio
      ratio={21 / 9}
      style={{
        width: 388,
        aspectRatio: '21 / 9',
        background: 'var(--muted)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div style={box}>21:9 depth heatmap</div>
    </AspectRatio>
  </div>
)
