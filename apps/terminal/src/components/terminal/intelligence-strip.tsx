// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Separator } from '@pairlens/ui/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type { DetectedSignal, SignalScan } from '@pairlens/strategy-engine'
import { formatRelativeTime } from '@/lib/format-time'

type IntelligenceStripProps = {
  scan: SignalScan | null
}

const HISTORY_LIMIT = 5

/** Coarse re-render tick so relative ages don't go stale between bar closes. */
function useMinuteTick(enabled: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [enabled])
}

function DirectionBadge({ signal }: { signal: DetectedSignal['signal'] }) {
  const isLong = signal.direction === 'long'
  return (
    <Badge
      variant={isLong ? 'default' : 'destructive'}
      className="gap-1 text-[10px]"
    >
      {isLong ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {isLong ? 'LONG' : 'SHORT'}
    </Badge>
  )
}

export function IntelligenceStrip({ scan }: IntelligenceStripProps) {
  const { t } = useTranslation()

  const latest = scan?.signals[0] ?? null
  useMinuteTick(latest !== null && !latest.active)

  const strategyLabel = (s: DetectedSignal['signal']) =>
    s.strategy.replace(/_/g, ' ')

  return (
    <div className="flex h-7 items-center gap-2.5 border-t px-3">
      {!scan ? (
        <span className="text-[11px] text-muted-foreground">
          {t('intelligence.analyzing')}
        </span>
      ) : (
        <>
          {/* Regime — always known once enough candles are buffered */}
          {scan.regime !== null && (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('intelligence.regime')}
                </span>
                <Badge variant="outline" className="gap-1 text-[11px]">
                  {scan.regime === 'trend' ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <Activity className="size-3" />
                  )}
                  {scan.regime === 'trend'
                    ? t('intelligence.trending')
                    : t('intelligence.choppy')}
                </Badge>
              </div>

              <Separator orientation="vertical" className="self-stretch" />
            </>
          )}

          {!latest ? (
            <span className="text-[11px] text-muted-foreground">
              {t('intelligence.noRecentSignals', { bars: scan.scannedBars })}
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={<div className="flex min-w-0 items-center gap-2.5" />}
              >
                <div className="flex shrink-0 items-center gap-2">
                  <DirectionBadge signal={latest.signal} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {(latest.signal.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                <p className="min-w-0 truncate text-xs capitalize text-muted-foreground">
                  {strategyLabel(latest.signal)}
                </p>

                {latest.active ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-up">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-up" />
                    </span>
                    {t('intelligence.live')}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {formatRelativeTime(latest.firstTs)}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="p-2">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('intelligence.recentSignals')}
                </p>
                <div className="flex flex-col gap-1">
                  {scan.signals.slice(0, HISTORY_LIMIT).map((s) => (
                    <div
                      key={`${s.signal.strategy}-${s.firstTs}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      <DirectionBadge signal={s.signal} />
                      <span className="capitalize">
                        {strategyLabel(s.signal)}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {(s.signal.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="ml-auto pl-2 text-muted-foreground">
                        {s.active
                          ? t('intelligence.live')
                          : formatRelativeTime(s.firstTs)}
                      </span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )
}
