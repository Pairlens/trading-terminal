// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@pairlens/ui/lib/utils'

import { useMarketData } from '@/lib/market-data-provider'
import { useStreamHealth } from '@/hooks/use-stream-health'
import { getActiveRegionHint, getRegionLabel } from '@/lib/region-settings'

const CONN_DOT: Record<string, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  stalled: 'bg-amber-400',
  disconnected: 'bg-muted-foreground',
}

const CONN_LABEL_KEYS: Record<string, string> = {
  connected: 'connection.live',
  connecting: 'connection.connecting',
  stalled: 'connection.stalled',
  disconnected: 'connection.offline',
}

export function ConnectionIndicator() {
  const { t } = useTranslation()
  const { status: marketDataStatus } = useMarketData()
  const health = useStreamHealth()

  // marketDataStatus only says a plugin serves market data — it stays
  // `connected` while every socket behind it is silent. Trust delivery over
  // capability so a suspended-then-resumed app can't show "Live" over frozen
  // prices; the reconnect it reports is already under way in the session layer.
  const connectionStatus =
    marketDataStatus === 'connected' && health === 'stale'
      ? 'stalled'
      : marketDataStatus

  const dot = useMemo(
    () => CONN_DOT[connectionStatus] ?? CONN_DOT.disconnected,
    [connectionStatus],
  )
  const label = useMemo(
    () => t(CONN_LABEL_KEYS[connectionStatus] ?? 'connection.offline'),
    [connectionStatus, t],
  )
  const regionHint = useMemo(() => {
    if (connectionStatus !== 'connected') return null
    const r = getActiveRegionHint()
    return r ? getRegionLabel(r) : null
  }, [connectionStatus])
  const pinging =
    connectionStatus === 'connected' || connectionStatus === 'connecting'

  return (
    <div
      className="flex items-center gap-1.5"
      title={`Data ${connectionStatus}`}
    >
      <span className="relative flex size-[5px]">
        {pinging && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
              dot,
            )}
          />
        )}
        <span
          className={cn('relative inline-flex size-[5px] rounded-full', dot)}
        />
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">
        {label}
        {regionHint && <span className="ml-1 opacity-70">· {regionHint}</span>}
      </span>
    </div>
  )
}
