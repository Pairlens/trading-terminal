// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@pairlens/ui/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { track } from '@/lib/analytics-events'
import { useMarketData } from '@/lib/market-data-provider'
import { useStreamHealth } from '@/hooks/use-stream-health'
import { streamHealth } from '@/lib/stream-health'
import { getActiveRegionHint, getRegionLabel } from '@/lib/region-settings'
import { useActivePair } from '@/lib/active-pair-context'
import { usePairUnavailable } from '@/stores/pair-availability-store'

const CONN_DOT: Record<string, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  // Amber, and the same amber as the retry below it: both mean the tape you
  // are reading is behind the market. Which of the two it is, is the label's
  // job — a third colour here would ask people to learn a scale before they
  // can read a warning.
  delayed: 'bg-amber-400',
  stalled: 'bg-amber-400',
  // Grey, not amber: nothing is wrong with the connection, there is simply
  // nothing for it to carry.
  nodata: 'bg-muted-foreground',
  disconnected: 'bg-muted-foreground',
}

const CONN_LABEL_KEYS: Record<string, string> = {
  connected: 'connection.live',
  connecting: 'connection.connecting',
  delayed: 'connection.delayed',
  stalled: 'connection.stalled',
  nodata: 'connection.noData',
  disconnected: 'connection.offline',
}

/** Static keys — the i18n audit cannot follow a template literal. */
const CONN_TOOLTIP_KEYS: Record<string, string> = {
  connected: 'connection.tooltipLive',
  connecting: 'connection.tooltipConnecting',
  delayed: 'connection.tooltipDelayed',
  stalled: 'connection.tooltipStalled',
  nodata: 'connection.tooltipNoData',
  disconnected: 'connection.tooltipOffline',
}

/**
 * Coarse on purpose. This answers "roughly how far behind am I", and a value
 * that resolves to the millisecond would have to re-render the header every
 * second to stay true. Sub-second reads as `0s`, which is the honest answer
 * for a feed that is keeping up.
 */
function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

/**
 * One report per venue per minute. A link that flaps produces the same finding
 * on the tenth transition as on the first, and the event exists to calibrate a
 * threshold rather than to count someone's train journey.
 */
const DELAY_REPORT_COOLDOWN_MS = 60_000
const lastDelayReportAt = new Map<string, number>()

export function ConnectionIndicator() {
  const { t } = useTranslation()
  const { status: marketDataStatus } = useMarketData()
  const health = useStreamHealth()
  const { activePair } = useActivePair()
  const pairUnavailable = usePairUnavailable(
    activePair?.market ?? '',
    activePair?.pairKey ?? '',
  )

  // marketDataStatus only says a plugin serves market data — it stays
  // `connected` while every socket behind it is silent. Trust delivery over
  // capability so a suspended-then-resumed app can't show "Live" over frozen
  // prices; the reconnect it reports is already under way in the session layer.
  //
  // Delivery has three answers, not two, and the middle one is the whole point
  // of this ladder: on a weak mobile link the sockets stay open and frames
  // keep trickling in late, so a store that only knows "something arrived in
  // the last 30 seconds" reports Live over a tape running seconds behind. It
  // used to go amber only once the connection dropped outright, which is the
  // last moment the warning is worth anything. `degraded` is that warning,
  // arriving while the socket is still up.
  //
  // A pair the venue doesn't carry gets its own state rather than 'stalled':
  // the transport is fine and nothing is being retried, so "Reconnecting" would
  // promise a recovery that isn't coming — but a green "Live" over panes that
  // all say "not available" is exactly the contradiction this indicator exists
  // to avoid.
  const connectionStatus =
    marketDataStatus !== 'connected'
      ? marketDataStatus
      : health === 'stale'
        ? 'stalled'
        : health === 'degraded'
          ? 'delayed'
          : pairUnavailable
            ? 'nodata'
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

  // Whether the thresholds behind the amber state are calibrated is not
  // knowable from here: they were derived from what a healthy feed looks like,
  // and both ways of being wrong are silent. See `market_data_delayed`.
  const venue = activePair?.market ?? ''
  useEffect(() => {
    if (connectionStatus !== 'delayed' || !venue) return
    const now = Date.now()
    if (now - (lastDelayReportAt.get(venue) ?? 0) < DELAY_REPORT_COOLDOWN_MS) {
      return
    }
    lastDelayReportAt.set(venue, now)
    track('market_data_delayed', { venue })
  }, [connectionStatus, venue])

  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex cursor-default items-center gap-1.5" />}
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
          {regionHint && (
            <span className="ml-1 opacity-70">· {regionHint}</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <ConnectionTooltipBody status={connectionStatus} />
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Split out so the age below is read when the tooltip OPENS rather than on
 * every render of the header. Nothing subscribes to it, and nothing should:
 * the number exists to be looked at once, deliberately.
 */
function ConnectionTooltipBody({ status }: { status: string }) {
  const { t } = useTranslation()
  const lastDeliveryAt = streamHealth.getLastDeliveryAt()

  return (
    <>
      <div className="font-medium">
        {t(CONN_TOOLTIP_KEYS[status] ?? 'connection.tooltipOffline')}
      </div>
      {lastDeliveryAt > 0 && (
        <div className="opacity-80">
          {t('connection.lastUpdate', {
            age: formatAge(Date.now() - lastDeliveryAt),
          })}
        </div>
      )}
    </>
  )
}
