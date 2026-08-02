// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePanePair } from '@pairlens/plugin-sdk'
import { BottomPanelDataLog } from './bottom-panel-data-log'
import { useOptionalCandleData } from '@/lib/chart-terminal-context'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'

export function DataLogPane() {
  const activePair = usePanePair()
  const candleData = useOptionalCandleData()

  if (!activePair || !candleData) {
    return <PanePairPicker />
  }

  return (
    <div className="h-full p-2">
      <BottomPanelDataLog
        candles={candleData.candles}
        latestCandle={candleData.latestCandle}
      />
    </div>
  )
}
