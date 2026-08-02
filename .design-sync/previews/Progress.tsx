// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Progress, ProgressLabel, ProgressValue } from '@pairlens/ui'

const wrap: React.CSSProperties = { padding: 16, width: 300 }

export const SyncProgress = () => (
  <div style={wrap}>
    <Progress value={65}>
      <ProgressLabel>Syncing OKX candles</ProgressLabel>
      <ProgressValue />
    </Progress>
  </div>
)

export const RiskBudget = () => (
  <div style={{ ...wrap, display: 'grid', gap: 18 }}>
    <Progress value={22}>
      <ProgressLabel>Daily loss limit</ProgressLabel>
      <ProgressValue />
    </Progress>
    <Progress value={58}>
      <ProgressLabel>Position exposure</ProgressLabel>
      <ProgressValue />
    </Progress>
    <Progress value={91}>
      <ProgressLabel>Max drawdown</ProgressLabel>
      <ProgressValue />
    </Progress>
  </div>
)

export const ValueSweep = () => (
  <div style={{ ...wrap, display: 'grid', gap: 14 }}>
    <Progress value={12} />
    <Progress value={40} />
    <Progress value={76} />
    <Progress value={100} />
  </div>
)
