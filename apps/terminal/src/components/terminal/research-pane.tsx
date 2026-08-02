// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePanePair } from '@pairlens/plugin-sdk'

import { useOptionalChartConfig } from '@/lib/chart-terminal-context'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { ResearchPanel } from '@/components/research/research-panel'

export function ResearchPane() {
  const activePair = usePanePair()
  const chartConfig = useOptionalChartConfig()

  if (!activePair || !chartConfig) {
    return <PanePairPicker />
  }

  return (
    <ResearchPanel pairKey={activePair.pairKey} market={chartConfig.market} />
  )
}
